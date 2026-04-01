const mysql = require('mysql2');
require('dotenv').config();

// Criar pool de conexões
let dbConfig = {
    waitForConnections: true,
    connectionLimit: 30,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: { rejectUnauthorized: false } // Required for Railway Cloud DB
};

if (process.env.DATABASE_URL) {
    console.log('Usando DATABASE_URL para conexão');
    // Parse the DATABASE_URL (formato: mysql://user:password@host:port/database)
    const url = new URL(process.env.DATABASE_URL);
    dbConfig.host = url.hostname;
    dbConfig.user = url.username;
    dbConfig.password = url.password;
    dbConfig.database = url.pathname.substring(1); // Remove the leading '/'
    dbConfig.port = url.port || 3306;
} else {
    dbConfig.host = process.env.MYSQLHOST || process.env.DB_HOST || 'localhost';
    dbConfig.user = process.env.MYSQLUSER || process.env.DB_USER || 'root';
    dbConfig.password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '';
    dbConfig.database = process.env.MYSQLDATABASE || process.env.DB_NAME || 'banco_questoes_estatistica';
    dbConfig.port = process.env.MYSQLPORT || process.env.DB_PORT || 3306;
}

const pool = mysql.createPool(dbConfig);

// Versão com promises
const promisePool = pool.promise();

// Testar conexão
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        console.error('   Verifique se o MySQL está rodando e as credenciais em .env estão corretas');
    } else {
        console.log('✅ Conectado ao banco de dados MySQL');
        connection.release();
    }
});

module.exports = { pool, promisePool, dbConfig };
