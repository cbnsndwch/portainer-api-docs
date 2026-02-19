const reject = [
    '@types/node',

    // eslint 10 and NextJS aren't friends yet
    '*eslint*',

    // Turbo does its own thing
    'turbo'
];

/**
 * @type {import('npm-check-updates').RunOptions}
 */
module.exports = {
    packageManager: 'pnpm',
    deep: true,
    reject
};
