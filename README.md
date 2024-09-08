# autoinstall-npm

## Description

This Node.js script analyzes JavaScript (.js) or ECMAScript modules (.mjs) files to identify missing npm packages, installs them if necessary, and optionally prompts the user for confirmation before each installation. The script can process either a single file or all files in a specified directory.

### Usage

```bash
node script.js [-f <file> | -d <directory>] [--confirm]
```

### Parameters
- **`-f <file>`**:
  - **Description**: Specifies the path to a single Node.js file to analyze.
  - **Note**: If this parameter is provided, the -d parameter is ignored.

- **`-d <directory>`**:
  - **Description**: Specifies the path to a directory. All .js and .mjs files in this directory will be analyzed.

- **`--confirm`**:
  - **Description**: Optional flag that prompts the user for confirmation before installing each missing package.
 
## Examples
1. Analyze and install missing packages for a single file with user confirmation:
```bash
node script.js -f path/to/your/file.js --confirm
```
2. Process all .js and .mjs files in a directory and install missing packages without user confirmation:
```bash
node script.js -d path/to/your/directory
```
3. Process all .js and .mjs files in a directory and prompt for confirmation before installation:
```bash
node script.js -d path/to/your/directory --confirm
```

### Output
- **Summary Table**: Displays a table of required packages for each file.
- **Installation Prompts**: If --confirm is used, prompts for confirmation before installing each package.
- **Status Messages**: Shows progress and status of the installation process with colored console output.

 ___

## Author
2024 Thorsten Willert

