 'use strict';

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// Configuración de la conexión obtenida de las variables de entorno (.env)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ecosuenos_db',
    port: process.env.DB_PORT || 3306
};

let pool;

/**
 * Inicializa la base de datos, asegura que las tablas existan
 * y crea el usuario administrador por defecto si no existe.
 */
async function initializeDatabase() {
    try {
        // 1. Crear una conexión temporal sin seleccionar base de datos para asegurar que exista
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            port: dbConfig.port
        });
        
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        await connection.end();

        // 2. Crear el Pool de conexiones definitivo
        pool = mysql.createPool(dbConfig);
        console.log('📦 Conexión a MySQL establecida correctamente.');

        // 3. Crear las tablas necesarias para la aplicación (Cumple con las especificaciones del PDF)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(100) NOT NULL UNIQUE,
                nombre VARCHAR(100) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('ADMIN', 'OPERADOR', 'CONSULTA') NOT NULL DEFAULT 'OPERADOR',
                activo TINYINT NOT NULL DEFAULT 1
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventario (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                descripcion TEXT,
                cantidad INT NOT NULL DEFAULT 0,
                stock_minimo INT NOT NULL DEFAULT 5,
                categoria VARCHAR(50),
                semaforo VARCHAR(20) DEFAULT 'VERDE',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);

        // 4. Crear usuario Administrador inicial si la tabla está vacía
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM usuarios');
        if (rows[0].count === 0) {
            const defaultPassword = 'AdminPassword123!'; // Cambiar en producción
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(defaultPassword, salt);

            await pool.query(
                'INSERT INTO usuarios (email, nombre, password_hash, role, activo) VALUES (?, ?, ?, ?, ?)',
                ['admin@ecosuenos.org', 'Administrador Inicial', hashedPassword, 'ADMIN', 1]
            );
            console.log('👤 Usuario administrador por defecto creado (admin@ecosuenos.org / AdminPassword123!)');
        }

    } catch (error) {
        console.error('❌ Error inicializando la base de datos MySQL:', error.message);
        process.exit(1);
    }
}

// Exportamos el pool para consultas externas y la función de inicialización
module.exports = {
    initializeDatabase,
    getPool: () => pool,
    query: (sql, params) => pool.query(sql, params)
};
