/**
 * @license MIT
 * @author Thorsten Willert
 * @version 1.1.0
 * 2023-2024
 */

import fs from 'fs/promises';
import { exec } from 'child_process';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import readline from 'readline';
import chalk from 'chalk';

/**
 * Executes a shell command and returns the result as a Promise.
 * @param {string} cmd - The shell command to execute.
 * @param {WritableStream} stdout - Stream to write standard output.
 * @param {WritableStream} stderr - Stream to write standard error.
 * @returns {Promise<string>} - The command output.
 */
function execShellCommand(cmd, stdout, stderr) {
    return new Promise((resolve, reject) => {
        const process = exec(cmd);

        let output = '';
        process.stdout.on('data', data => {
            output += data;
            stdout.write(data);
        });
        process.stderr.on('data', data => {
            stderr.write(data);
        });

        process.on('close', (code) => {
            if (code !== 0) {
                reject(`Command failed with exit code ${code}`);
            } else {
                resolve(output);
            }
        });
    });
}

/**
 * Determines if a given path is a local file.
 * @param {string} filePath - The file path to check.
 * @param {string} baseDir - The base directory where the file should be checked.
 * @returns {Promise<boolean>} - `true` if the path is a local file and exists, otherwise `false`.
 */
async function isLocalFile(filePath, baseDir) {
    const fullPath = path.resolve(baseDir, filePath);

    try {
        await fs.access(fullPath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Reads the content of a file and extracts all imported/required packages.
 * @param {string} filePath - The path to the file to analyze.
 * @param {string} baseDir - The base directory for resolving relative paths.
 * @returns {Promise<string[]>} - A list of required packages.
 */
async function findRequiredPackages(filePath, baseDir) {
    const fileContent = await fs.readFile(filePath, 'utf8');

    const importNamedRegex = /import\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/g;
    const importDefaultRegex = /import\s+[^'"]*\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;

    const matches = new Set();
    let match;

    while ((match = importNamedRegex.exec(fileContent)) !== null) {
        if (!await isLocalFile(match[1], baseDir)) {
            matches.add(match[1]);
        }
    }

    while ((match = importDefaultRegex.exec(fileContent)) !== null) {
        if (!await isLocalFile(match[1], baseDir)) {
            matches.add(match[1]);
        }
    }

    while ((match = requireRegex.exec(fileContent)) !== null) {
        if (!await isLocalFile(match[1], baseDir)) {
            matches.add(match[1]);
        }
    }

    while ((match = dynamicImportRegex.exec(fileContent)) !== null) {
        if (!await isLocalFile(match[1], baseDir)) {
            matches.add(match[1]);
        }
    }

    return Array.from(matches);
}

/**
 * Checks if a package is installed using npm list.
 * @param {string} pkg - The name of the package.
 * @param {Set<string>} checkedPackages - A set of already checked packages.
 * @returns {Promise<boolean>} - `true` if the package is installed, otherwise `false`.
 */
async function isPackageInstalled(pkg, checkedPackages) {
    if (checkedPackages.has(pkg)) {
        return true;
    }

    try {
        const output = await execShellCommand(`npm list ${pkg}`, process.stdout, process.stderr);
        const isInstalled = output.includes(pkg);
        if (isInstalled) {
            checkedPackages.add(pkg);
        }
        return isInstalled;
    } catch {
        return false;
    }
}

/**
 * Prompts the user for confirmation before installing each package.
 * @param {string} question - The question to ask the user.
 * @returns {Promise<boolean>} - `true` if the user answers "yes", otherwise `false`.
 */
function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

/**
 * Checks for required packages and installs missing packages for a given file.
 * @param {string} filePath - The path to the file to analyze.
 * @param {boolean} promptForConfirmation - Whether to prompt for confirmation before installing each package.
 * @param {Set<string>} installedPackages - A set of already installed packages.
 * @param {Set<string>} checkedPackages - A set of already checked packages.
 * @returns {Promise<void>} - A promise that resolves when all packages have been checked and installed.
 */
async function checkAndInstallPackages(filePath, promptForConfirmation, installedPackages, checkedPackages) {
    const baseDir = path.dirname(filePath);
    const requiredPackages = await findRequiredPackages(filePath, baseDir);
    const packagesToInstall = [];

    for (const pkg of requiredPackages) {
        if (!installedPackages.has(pkg) && !(await isPackageInstalled(pkg, checkedPackages))) {
            packagesToInstall.push(pkg);
        }
    }

    if (packagesToInstall.length === 0) {
        console.log(chalk.yellowBright(`No packages need to be installed for file: ${filePath}`));
        return;
    }

    console.table(packagesToInstall.map(pkg => ({ Package: pkg })));

    for (const pkg of packagesToInstall) {
        if (promptForConfirmation) {
            const install = await promptUser(`Install package ${pkg}? (yes/no): `);
            if (!install) {
                console.log(chalk.yellow(`Skipping installation of ${pkg}`));
                continue;
            }
        }

        console.log(chalk.cyan(`Package ${pkg} is not installed. Installing...`));
        const cmd = `sudo npm install ${pkg}`;
        try {
            await execShellCommand(cmd, process.stdout, process.stderr);
            console.log(chalk.green(`Successfully installed ${pkg}`));
            installedPackages.add(pkg); // Add to installedPackages after successful installation
            checkedPackages.add(pkg); // Mark as checked after installation
        } catch (error) {
            console.error(chalk.red(`Failed to install ${pkg}: ${error}`));
        }
    }
}

/**
 * Processes all .js and .mjs files in the given directory.
 * @param {string} dirPath - The path to the directory to process.
 * @param {boolean} promptForConfirmation - Whether to prompt for confirmation before installing each package.
 * @returns {Promise<void>} - A promise that resolves when all files have been processed.
 */
async function processDirectory(dirPath, promptForConfirmation) {
    const files = await fs.readdir(dirPath);
    const jsFiles = files.filter(file => file.endsWith('.js') || file.endsWith('.mjs'));

    const installedPackages = new Set(); // To keep track of installed packages
    const checkedPackages = new Set(); // To keep track of checked packages

    for (const file of jsFiles) {
        const filePath = path.join(dirPath, file);
        console.log(chalk.magenta(`Processing file: ${filePath}`));
        await checkAndInstallPackages(filePath, promptForConfirmation, installedPackages, checkedPackages);
        console.log(chalk.magenta(`Finished processing file: ${filePath}`));
    }
}

// Yargs configuration for parameter passing
const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [-f <file> | -d <directory>] [--confirm]')
    .option('f', {
        alias: 'file',
        describe: 'Path to a single Node.js file to analyze',
        type: 'string',
        demandOption: false
    })
    .option('d', {
        alias: 'directory',
        describe: 'Path to the directory to analyze',
        type: 'string',
        demandOption: false
    })
    .option('confirm', {
        describe: 'Prompt for confirmation before installing each package',
        type: 'boolean',
        default: false
    })
    .help()
    .argv;

// Determine the file or directory and process accordingly
const filePath = argv.file ? path.resolve(argv.file) : null;
const dirPath = argv.directory ? path.resolve(argv.directory) : null;
const promptForConfirmation = argv.confirm;

if (filePath) {
    console.log(chalk.magenta(`Processing file: ${filePath}`));
    const installedPackages = new Set();
    const checkedPackages = new Set();
    checkAndInstallPackages(filePath, promptForConfirmation, installedPackages, checkedPackages)
        .then(() => console.log(chalk.green('Finished checking and installing packages for the file')))
        .catch(err => console.error(chalk.red(err)));
} else if (dirPath) {
    processDirectory(dirPath, promptForConfirmation)
        .then(() => console.log(chalk.green('Finished checking and installing packages for all files')))
        .catch(err => console.error(chalk.red(err)));
} else {
    console.error(chalk.red('You must provide either a file with -f or a directory with -d.'));
}
