// Standard Expo Babel config. Metro applies babel-preset-expo without this
// file; jest (jest-expo preset) needs it spelled out to transform TypeScript.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
