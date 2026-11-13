'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const userRepository = require('./repositories/userRepository');

function createApp(context) {
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Servir la interfaz estática desde la carpeta public
    app.use(express.static(path.join(__dirname, '../public')));

    app.use((req, res, next) => {
        req.users = userRepository;
        next();
    });

    app.get('/api', (req, res) => {
        res.json({
            status: 'success',
            message: 'API de la Fundación Ecosueños activa y corriendo sobre MySQL 🚀'
        });
    });

    app.use((err, req, res, next) => {
        res.status(500).json({ status: 'error', message: err.message });
    });

    return app;
}

module.exports = { createApp };
