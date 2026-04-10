/**
 * Definições de Limites e Regras de Negócio por Plano
 * Auto Guincho V2
 */
module.exports = {
    basic: {
        max_cities: 1,
        max_photos: 0,
        requires_logo: false,
        show_social: false,
        show_maps: false,
        name: 'Básico'
    },
    partner: {
        max_cities: 8,
        max_photos: 3,
        requires_logo: true,
        show_social: false,
        show_maps: false,
        name: 'Intermediário'
    },
    elite: {
        max_cities: 9999, // Ilimitado na prática
        max_photos: 10,
        requires_logo: true,
        show_social: true,
        show_maps: true,
        name: 'Elite'
    }
};
