/* Shared helper utilities */

const pick = (obj = {}, keys = []) =>
    keys.reduce((acc, key) => {
        if (Object.prototype.hasOwnProperty.call(obj, key)) acc[key] = obj[key];

        return acc;
    }, {});

const omit = (obj = {}, keys = []) =>
    Object.keys(obj).reduce((acc, key) => {
        if (!keys.includes(key)) acc[key] = obj[key];

        return acc;
    }, {});

const isEmpty = (val) =>
    val === undefined || val === null || (typeof val === 'object' && Object.keys(val).length === 0) || (typeof val === 'string' && val.trim() === '');

module.exports = {
    pick,
    omit,
    isEmpty,
};
