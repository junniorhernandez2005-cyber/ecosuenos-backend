 'use strict';

const db = require('../db/database');

/**
 * Repositorio de Usuarios optimizado para MySQL
 */
const userRepository = {
    /**
     * Busca un usuario en la base de datos por su dirección de correo electrónico.
     * @param {string} email 
     * @returns {Promise<Object|null>}
     */
    async findByEmail(email) {
        try {
            const sql = 'SELECT * FROM usuarios WHERE email = ? LIMIT 1';
            const [rows] = await db.query(sql, [email]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('❌ Error en userRepository.findByEmail:', error.message);
            throw error;
        }
    },

    /**
     * Busca un usuario por su ID numérico.
     * @param {number} id 
     * @returns {Promise<Object|null>}
     */
    async findById(id) {
        try {
            const sql = 'SELECT * FROM usuarios WHERE id = ? LIMIT 1';
            const [rows] = await db.query(sql, [id]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('❌ Error en userRepository.findById:', error.message);
            throw error;
        }
    }
};

module.exports = userRepository;
