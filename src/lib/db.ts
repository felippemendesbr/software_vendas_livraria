import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

// Rate limiting de logs para evitar spam
interface LogEntry {
  type: string;
  timestamp: number;
}

const logCooldown = new Map<string, number>();
const LOG_COOLDOWN_MS = 5000; // 5 segundos

/**
 * Valida variáveis de ambiente e retorna configuração
 */
function validateAndGetConfig(): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  encrypt: boolean;
} {
  const host = process.env.LEGACY_DB_HOST;
  const portStr = process.env.LEGACY_DB_PORT;
  const user = process.env.LEGACY_DB_USER;
  const password = process.env.LEGACY_DB_PASSWORD;
  const database = process.env.LEGACY_DB_NAME;
  const encryptStr = process.env.LEGACY_DB_ENCRYPT;

  // Validar host
  if (!host || host.trim() === '') {
    throw new Error(
      'LEGACY_DB_HOST não definido. Configure no arquivo .env.local'
    );
  }

  // Validar que host não contém vírgula/porta
  if (host.includes(',') || host.includes(':')) {
    throw new Error(
      `LEGACY_DB_HOST contém vírgula ou dois pontos: "${host}". ` +
      `Use apenas o host (ex: 51.222.51.77) e defina a porta em LEGACY_DB_PORT.`
    );
  }

  // Validar porta
  if (!portStr || portStr.trim() === '') {
    throw new Error(
      'LEGACY_DB_PORT não definido. Configure no arquivo .env.local'
    );
  }

  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `LEGACY_DB_PORT inválido: "${portStr}". Deve ser um número entre 1 e 65535.`
    );
  }

  // Validar user
  if (!user || user.trim() === '') {
    throw new Error(
      'LEGACY_DB_USER não definido. Configure no arquivo .env.local'
    );
  }

  // Validar password
  if (!password || password.trim() === '') {
    throw new Error(
      'LEGACY_DB_PASSWORD não definido. Configure no arquivo .env.local'
    );
  }

  // Validar database
  if (!database || database.trim() === '') {
    throw new Error(
      'LEGACY_DB_NAME não definido. Configure no arquivo .env.local'
    );
  }

  // Validar encrypt (default: true)
  const encrypt = encryptStr === 'false' ? false : true;

  return {
    host: host.trim(),
    port,
    user: user.trim(),
    password: password.trim(),
    database: database.trim(),
    encrypt,
  };
}

/**
 * Formata erros do mssql/tedious para logs amigáveis
 */
function formatMssqlError(err: any, config: { host: string; port: number; database: string }): {
  type: string;
  message: string;
  hint: string;
  code?: string | number;
  number?: number;
} {
  const target = `${config.host}:${config.port}`;
  const errMessage = err.message || String(err);
  const errCode = err.code;
  const errNumber = err.number;

  // DNS / Host inválido
  if (errCode === 'ENOTFOUND' || errMessage.includes('ENOTFOUND') || errMessage.includes('getaddrinfo')) {
    return {
      type: 'DNS_ERROR',
      message: `Host inválido ou não encontrado: ${config.host}`,
      hint: `Verifique LEGACY_DB_HOST no .env.local. Teste: ping ${config.host} ou nslookup ${config.host}`,
      code: errCode,
    };
  }

  // Timeout / Conexão recusada
  if (
    errCode === 'ETIMEDOUT' ||
    errCode === 'ECONNREFUSED' ||
    errMessage.includes('timeout') ||
    errMessage.includes('ECONNREFUSED') ||
    errMessage.includes('Could not connect') ||
    errMessage.includes('sequence')
  ) {
    return {
      type: 'CONNECTION_REFUSED',
      message: `Conexão recusada ou timeout em ${target}`,
      hint: `Porta bloqueada ou SQL Server não exposto. Teste: nc -vz ${config.host} ${config.port} ou telnet ${config.host} ${config.port}. Verifique firewall e se o SQL Server está rodando.`,
      code: errCode,
    };
  }

  // Login failed
  if (
    errMessage.includes('Login failed') ||
    errMessage.includes('authentication') ||
    errNumber === 18456
  ) {
    return {
      type: 'LOGIN_FAILED',
      message: 'Credenciais inválidas ou sem permissão',
      hint: `Verifique LEGACY_DB_USER e LEGACY_DB_PASSWORD no .env.local. Confirme se o usuário tem acesso ao database "${config.database}".`,
      code: errCode,
      number: errNumber,
    };
  }

  // TLS / Certificate
  if (
    errMessage.includes('certificate') ||
    errMessage.includes('TLS') ||
    errMessage.includes('self signed') ||
    errMessage.includes('trust')
  ) {
    return {
      type: 'TLS_ERROR',
      message: 'Erro de certificado TLS',
      hint: `Configure LEGACY_DB_ENCRYPT=true e trustServerCertificate=true no .env.local. O sistema já usa trustServerCertificate=true por padrão.`,
      code: errCode,
    };
  }

  // Database não encontrado
  if (
    errMessage.includes('Cannot open database') ||
    errMessage.includes('database') && errMessage.includes('not found') ||
    errNumber === 4060
  ) {
    return {
      type: 'DATABASE_NOT_FOUND',
      message: `Database "${config.database}" não encontrado`,
      hint: `Verifique LEGACY_DB_NAME no .env.local. Liste databases disponíveis conectando ao SQL Server.`,
      code: errCode,
      number: errNumber,
    };
  }

  // Erro genérico
  return {
    type: 'UNKNOWN_ERROR',
    message: errMessage,
    hint: `Verifique todas as variáveis de ambiente (.env.local): LEGACY_DB_HOST, LEGACY_DB_PORT, LEGACY_DB_USER, LEGACY_DB_PASSWORD, LEGACY_DB_NAME, LEGACY_DB_ENCRYPT`,
    code: errCode,
    number: errNumber,
  };
}

/**
 * Loga erro formatado com rate limiting
 */
function logError(err: any, config: { host: string; port: number; database: string }, context: string = '') {
  const formatted = formatMssqlError(err, config);
  const logKey = `${formatted.type}-${config.host}:${config.port}`;
  const now = Date.now();
  const lastLog = logCooldown.get(logKey) || 0;

  // Rate limiting: só loga se passou o cooldown
  if (now - lastLog < LOG_COOLDOWN_MS) {
    return; // Silenciosamente ignora para evitar spam
  }

  logCooldown.set(logKey, now);

  // Log completo no terminal
  console.error('\n' + '='.repeat(60));
  console.error('❌ ERRO DE CONEXÃO SQL SERVER');
  if (context) console.error(`Contexto: ${context}`);
  console.error('─'.repeat(60));
  console.error(`Destino:     ${config.host}:${config.port}`);
  console.error(`Database:    ${config.database}`);
  console.error(`Driver:      mssql/tedious`);
  console.error(`Tipo:        ${formatted.type}`);
  console.error(`Mensagem:    ${formatted.message}`);
  if (formatted.code) console.error(`Código:      ${formatted.code}`);
  if (formatted.number) console.error(`SQL Error:   ${formatted.number}`);
  console.error(`\n💡 Sugestão:`);
  console.error(`   ${formatted.hint}`);
  
  // Stack trace (apenas primeiras 3 linhas)
  if (err.stack) {
    const stackLines = err.stack.split('\n').slice(0, 3);
    console.error(`\n📍 Stack (resumido):`);
    stackLines.forEach((line: string) => console.error(`   ${line.trim()}`));
  }
  
  console.error('='.repeat(60) + '\n');
}

/**
 * Obtém ou cria o pool de conexões com o banco legado
 */
export async function getDbPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  // Validar e obter configuração
  const config = validateAndGetConfig();

  // Criar configuração do mssql
  // IMPORTANTE: No Node (mssql/tedious) NÃO usar "server,porta" no host
  // Porta deve ser separada
  const mssqlConfig: sql.config = {
    server: config.host, // Apenas o host, sem porta
    port: config.port,   // Porta separada
    user: config.user,
    password: config.password,
    database: config.database,
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: true, // Sempre true (equivalente ao .NET)
      enableArithAbort: true,
    },
  };

  try {
    pool = await sql.connect(mssqlConfig);
    
    console.log('✅ Conectado ao SQL Server:', {
      target: `${config.host}:${config.port}`,
      database: config.database,
      encrypt: config.encrypt,
    });
    
    return pool;
  } catch (error) {
    logError(error, config, 'getDbPool');
    throw error;
  }
}

/**
 * Fecha o pool de conexões
 */
export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

/**
 * Descobre a estrutura da tabela Pedidos
 */
export interface PedidosSchema {
  hasId: boolean;
  hasDataHora: boolean;
  hasTotal: boolean;
  hasFormaPagamento: boolean;
  dataHoraColumn?: string;
  totalColumn?: string;
  formaPagamentoColumn?: string;
}

export async function discoverPedidosSchema(): Promise<PedidosSchema> {
  const pool = await getDbPool();
  const request = pool.request();

  try {
    const result = await request.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Pedidos'
      ORDER BY ORDINAL_POSITION
    `);

    const schema: PedidosSchema = {
      hasId: false,
      hasDataHora: false,
      hasTotal: false,
      hasFormaPagamento: false,
    };

    result.recordset.forEach((row: any) => {
      const colName = row.COLUMN_NAME.toLowerCase();
      
      if (colName === 'id') {
        schema.hasId = true;
      } else if (colName.includes('data') || colName.includes('hora') || colName.includes('datetime')) {
        schema.hasDataHora = true;
        schema.dataHoraColumn = row.COLUMN_NAME;
      } else if (colName === 'total' || colName.includes('valor')) {
        schema.hasTotal = true;
        schema.totalColumn = row.COLUMN_NAME;
      } else if (colName.includes('pagamento') || colName.includes('forma')) {
        schema.hasFormaPagamento = true;
        schema.formaPagamentoColumn = row.COLUMN_NAME;
      }
    });

    return schema;
  } catch (error) {
    console.error('❌ Erro ao descobrir estrutura de Pedidos:', error);
    // Retornar schema padrão assumido
    return {
      hasId: true,
      hasDataHora: true,
      hasTotal: true,
      hasFormaPagamento: true,
      dataHoraColumn: 'DataHora',
      totalColumn: 'Total',
      formaPagamentoColumn: 'FormaPagamento',
    };
  }
}

/**
 * Verifica se a coluna FormaPagamento existe em PedidoItens
 */
export async function checkPedidoItensFormaPagamento(): Promise<{
  exists: boolean;
  columnName?: string;
  dataType?: string;
}> {
  const pool = await getDbPool();
  const request = pool.request();

  try {
    const result = await request.query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'PedidoItens'
      AND (COLUMN_NAME LIKE '%FormaPagamento%' OR COLUMN_NAME LIKE '%Pagamento%' OR COLUMN_NAME LIKE '%Forma%')
    `);

    if (result.recordset.length > 0) {
      const col = result.recordset[0];
      return {
        exists: true,
        columnName: col.COLUMN_NAME,
        dataType: col.DATA_TYPE,
      };
    }

    return { exists: false };
  } catch (error) {
    console.error('❌ Erro ao verificar FormaPagamento em PedidoItens:', error);
    return { exists: false };
  }
}

/**
 * Obtém a versão do SQL Server
 */
export async function getSqlServerVersion(): Promise<string> {
  const pool = await getDbPool();
  const request = pool.request();

  try {
    const result = await request.query('SELECT @@VERSION AS Version');
    return result.recordset[0].Version;
  } catch (error) {
    console.error('❌ Erro ao obter versão do SQL Server:', error);
    throw error;
  }
}

/**
 * Obtém informações de configuração (sem senha)
 */
export function getDbConfigInfo(): {
  host: string;
  port: number;
  database: string;
  user: string;
  encrypt: boolean;
} {
  try {
    const config = validateAndGetConfig();
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      encrypt: config.encrypt,
    };
  } catch (error: any) {
    return {
      host: process.env.LEGACY_DB_HOST || '(não definido)',
      port: parseInt(process.env.LEGACY_DB_PORT || '0', 10),
      database: process.env.LEGACY_DB_NAME || '(não definido)',
      user: process.env.LEGACY_DB_USER || '(não definido)',
      encrypt: process.env.LEGACY_DB_ENCRYPT !== 'false',
    };
  }
}

/**
 * Formata erro para resposta HTTP (sem informações sensíveis)
 */
export function formatErrorForResponse(err: any): {
  type: string;
  message: string;
  hint: string;
} {
  const config = getDbConfigInfo();
  return formatMssqlError(err, {
    host: config.host,
    port: config.port,
    database: config.database,
  });
}

/** Colunas opcionais em Produtos (nomes reais no banco, para SELECT/INSERT/UPDATE dinâmicos) */
export interface ProdutosColumnSchema {
  imagemColumn: string | null;
  estadoColumn: string | null;
  estadoIsBit: boolean;
}

const IMAGEM_COLUMN_CANDIDATES = [
  'ImagemUrl',
  'UrlImagem',
  'URLImagem',
  'FotoUrl',
  'Imagem',
  'LinkImagem',
  'CaminhoImagem',
  'UrlFoto',
  'Foto',
  'FotoProduto',
  'Capa',
  'UrlCapa',
  'ImagemProduto',
  'PathImagem',
];

const IMAGEM_FRIENDLY_TYPES = new Set([
  'varchar',
  'nvarchar',
  'char',
  'nchar',
  'text',
  'ntext',
]);

const ESTADO_VARCHAR_CANDIDATES = ['Estado', 'Status', 'Situacao'];
const ESTADO_BIT_CANDIDATES = ['Ativo'];

let produtosColumnSchemaCache: ProdutosColumnSchema | null = null;

/**
 * Descobre colunas opcionais da tabela Produtos (imagem URL, estado / ativo).
 */
export async function discoverProdutosColumnSchema(): Promise<ProdutosColumnSchema> {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Produtos'
  `);

  const byLower = new Map<string, { name: string; dataType: string }>();
  for (const row of result.recordset as { COLUMN_NAME: string; DATA_TYPE: string }[]) {
    byLower.set(row.COLUMN_NAME.toLowerCase(), {
      name: row.COLUMN_NAME,
      dataType: (row.DATA_TYPE || '').toLowerCase(),
    });
  }

  let imagemColumn: string | null = null;
  for (const c of IMAGEM_COLUMN_CANDIDATES) {
    const hit = byLower.get(c.toLowerCase());
    if (hit) {
      imagemColumn = hit.name;
      break;
    }
  }

  // Fallback: qualquer coluna cujo nome sugira URL de imagem e tipo seja texto
  if (!imagemColumn) {
    const nameHint = /imagem|foto|photo|picture|capa|banner|thumb|url.*img|img.*url/i;
    for (const [, col] of byLower) {
      if (!nameHint.test(col.name)) continue;
      if (IMAGEM_FRIENDLY_TYPES.has(col.dataType)) {
        imagemColumn = col.name;
        break;
      }
    }
  }

  let estadoColumn: string | null = null;
  let estadoIsBit = false;
  for (const c of ESTADO_VARCHAR_CANDIDATES) {
    const hit = byLower.get(c.toLowerCase());
    if (hit) {
      estadoColumn = hit.name;
      estadoIsBit = hit.dataType === 'bit';
      break;
    }
  }
  if (!estadoColumn) {
    for (const c of ESTADO_BIT_CANDIDATES) {
      const hit = byLower.get(c.toLowerCase());
      if (hit) {
        estadoColumn = hit.name;
        estadoIsBit = true;
        break;
      }
    }
  }

  return { imagemColumn, estadoColumn, estadoIsBit };
}

export async function getProdutosColumnSchema(): Promise<ProdutosColumnSchema> {
  if (!produtosColumnSchemaCache) {
    produtosColumnSchemaCache = await discoverProdutosColumnSchema();
  }
  return produtosColumnSchemaCache;
}

/** Invalida cache de schema (útil em testes ou após migração) */
export function clearProdutosColumnSchemaCache(): void {
  produtosColumnSchemaCache = null;
}
