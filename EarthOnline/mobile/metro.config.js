const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// h3-js 等套件在開啟 package exports 時，Metro Web 偶發無法解析
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
