 'use strict';

const http = require('node:http');
const fs = require('node:fs');
const { loadConfig, ConfigError } = require('./config');
const { initializeDatabase } = require('./db/database');
const { createApp } = require('./app');

async function main() {
    let config;
    try {
        // 1. Cargar la configuración general del sistema (.env)
        config = loadConfig();
    } catch (err) {
        if (err instanceof ConfigError) {
            console.error(`[Config] ${err.message}`);
            process.exit(1);
        }
        throw err;
    }

    // 2. Inicializar Base de Datos MySQL de forma asíncrona
    await initializeDatabase();

    // 3. Crear la aplicación Express pasando la configuración requerida
    const app = createApp({
        config,
        logRequests: !config.isProduction || process.env.LOG_REQUESTS === 'true'
    });

    // 4. Crear el servidor HTTP convencional
    const server = http.createServer(app);

    // 5. Poner el servidor en línea en el puerto configurado
    server.listen(config.port, config.host, () => {
        const scheme = 'http';
        console.log(`🚀 [Server] Eco_sueños API escuchando en ${scheme}://${config.host || 'localhost'}:${config.port}/api (entorno: ${config.env || 'development'})`);
    });
}

// Ejecutar la función principal atrapando cualquier error no controlado
main().catch((error) => {
    console.error('❌ Error crítico en el ciclo de vida del servidor:', error);
    process.exit(1);
});
