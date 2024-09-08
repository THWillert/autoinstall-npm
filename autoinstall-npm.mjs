/**
 * @license MIT
 * @author Thorsten Willert
 * @version 1.0.0
 * 2024
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
 * Reads the content of a file and extracts all imported/required packages.
 * @param {string} filePath - The path to the file to analyze.
 * @returns {Promise<string[]>} - A list of required packages.
 */
async function findRequiredPackages(filePath) {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const importRegex = /import\s+.*\s+from\s+['"](.+)['"];?/g;
    const requireRegex = /require\(['"](.+)['"]\)/g;
    const matches = new Set();

    let match;
    while ((match = importRegex.exec(fileContent)) !== null) {
        matches.add(match[1]);
    }

    while ((match = requireRegex.exec(fileContent)) !== null) {
        matches.add(match[1]);
    }

    return Array.from(matches);
}

/**
 * Checks if a package is installed using npm list.
 * @param {string} pkg - The name of the package.
 * @returns {Promise<boolean>} - `true` if the package is installed, otherwise `false`.
 */
async function isPackageInstalled(pkg) {
    try {
        const output = await execShellCommand(`npm list ${pkg}`, process.stdout, process.stderr);
        return output.includes(pkg);
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
 * Loads the list of already installed packages from the file.
 * @param {string} filePath - The path to the file where installed packages are recorded.
 * @returns {Promise<Set<string>>} - A set of installed packages.
 */
async function loadInstalledPackages(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return new Set(data.split('\n').filter(Boolean));
    } catch {
        return new Set();
    }
}

/**
 * Saves the list of installed packages to the file.
 * @param {string} filePath - The path to the file where installed packages will be recorded.
 * @param {Set<string>} packages - A set of installed packages.
 * @returns {Promise<void>} - Resolves when the data is written to the file.
 */
async function saveInstalledPackages(filePath, packages) {
    const data = Array.from(packages).join('\n');
    await fs.writeFile(filePath, data, 'utf8');
}

/**
 * Checks for required packages and installs missing packages for a given file.
 * @param {string} filePath - The path to the file to analyze.
 * @param {boolean} promptForConfirmation - Whether to prompt for confirmation before installing each package.
 * @param {Set<string>} installedPackages - A set of already installed packages.
 * @param {string} installedPackagesFile - The path to the file where installed packages are recorded.
 * @returns {Promise<void>} - A promise that resolves when all packages have been checked and installed.
 */
async function checkAndInstallPackages(filePath, promptForConfirmation, installedPackages, installedPackagesFile) {
    const requiredPackages = await findRequiredPackages(filePath);
    const packagesToInstall = [];

    for (const pkg of requiredPackages) {
        if (!installedPackages.has(pkg) && !(await isPackageInstalled(pkg))) {
            packagesToInstall.push(pkg);
        }
    }

    if (packagesToInstall.length === 0) {
        console.log(chalk.yellowBright(`No packages need to be installed for file: ${filePath}`));
        return;
    }

    // Display summary of required packages
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
            installedPackages.add(pkg);
            await saveInstalledPackages(installedPackagesFile, installedPackages);
        } catch (error) {
            console.error(chalk.red(`Failed to install ${pkg}: ${error}`));
        }
    }
}

/**
 * Processes all .js and .mjs files in the given directory.
 * @param {string} dirPath - The path to the directory to process.
 * @param {boolean} promptForConfirmation - Whether to prompt for confirmation before installing each package.
 * @param {string} installedPackagesFile - The path to the file where installed packages are recorded.
 * @returns {Promise<void>} - A promise that resolves when all files have been processed.
 */
async function processDirectory(dirPath, promptForConfirmation, installedPackagesFile) {
    const files = await fs.readdir(dirPath);
    const jsFiles = files.filter(file => file.endsWith('.js') || file.endsWith('.mjs'));

    const installedPackages = await loadInstalledPackages(installedPackagesFile);

    for (const file of jsFiles) {
        const filePath = path.join(dirPath, file);
        console.log(chalk.magenta(`Processing file: ${filePath}`));
        await checkAndInstallPackages(filePath, promptForConfirmation, installedPackages, installedPackagesFile);
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

// Determine the file or directory and the installed packages file path
const filePath = argv.file ? path.resolve(argv.file) : null;
const dirPath = argv.directory ? path.resolve(argv.directory) : null;
const promptForConfirmation = argv.confirm;
const installedPackagesFile = path.resolve('./installed_packages.txt');

if (filePath) {
    console.log(chalk.magenta(`Processing file: ${filePath}`));
    checkAndInstallPackages(filePath, promptForConfirmation, await loadInstalledPackages(installedPackagesFile), installedPackagesFile)
        .then(() => console.log(chalk.green('Finished checking and installing packages for the file')))
        .catch(err => console.error(chalk.red(err)));
} else if (dirPath) {
    processDirectory(dirPath, promptForConfirmation, installedPackagesFile)
        .then(() => console.log(chalk.green('Finished checking and installing packages for all files')))
        .catch(err => console.error(chalk.red(err)));
} else {
    console.error(chalk.red('You must provide either a file with -f or a directory with -d.'));
}
