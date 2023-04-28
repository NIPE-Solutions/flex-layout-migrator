# Angular Flex-Layout Migration Tool

[![Development Status](https://img.shields.io/badge/status-under%20development-critical)](https://github.com/NIPE-Solutions/flex-layout-migrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

This tool assists in migrating projects that use the deprecated Angular Flex-Layout library to CSS classes. The package is designed to be as flexible and customizable as possible to accommodate different migration scenarios. Contributions are highly welcome!

**Please note that this project is currently under development and not yet stable. Use it at your own risk.**

The Idea of this project is to migrate the Angular Flex-Layout attributes to CSS classes, CSS styles or whatever is needed. The current plan is to implement the conversion to Tailwind and Plain CSS but it should be possible to implement other converters as well. Right now the focus relies on Tailwind and the most used attributes. If you need a specific attribute, feel free to open an issue or implement it yourself and create a pull request.

## Features

- Scans and processes HTML files or entire directories.
- Migrates Angular Flex-Layout attributes to CSS classes.
- Configurable attribute-to-class mapping using a JSON configuration file.
- Support for handling attribute values.

## Status

The following features are currently available: 
- Scans and processes HTML files or entire directories.
- Migrates Angular Flex-Layout attributes according to the implementation of the specific attribute converter (See available converters).

### Flex-Layout Attributes

The following Angular Flex-Layout attributes need to be migrated:

| Flex-Layout Attribute | Supported Values                                                                                              | Breakpoint Modifiers Supported  |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| fxLayout              | row, column, row-reverse, column-reverse                                                                      | [X]                             |
| fxLayoutAlign         | start start, start center, start end, center start, center center, center end, end start, end center, end end | [X]                             |
| fxLayoutGap           | e.g. 5px, 10px, 1rem, 2rem                                                                                    | [X]                             |
| fxFlex                | e.g. 0 1 auto, 1 1 0%, 2 2 0%                                                                                 | [X]                             |
| fxFlexOffset          | e.g. 5px, 10px, 1rem, 2rem                                                                                    | [X]                             |
| fxFlexOrder           | e.g. 0, 1, 2, 3                                                                                               | [X]                             |
| fxFlexAlign           | start, center, end, stretch, baseline                                                                         | [X]                             |
| fxFlexFill            | No specific values, simply fills available space                                                              | [ ]                             |

### Available Converters

| Flex-Layout Attribute | Tailwind Converter | Plain-CSS Converter |
| --------------------- | ------------------ | ------------------- |
| fxLayout              | [ ]                | [ ]                 |
| fxLayoutAlign         | [ ]                | [ ]                 |
| fxLayoutGap           | [ ]                | [ ]                 |
| fxFlex                | [ ]                | [ ]                 |
| fxFlexOffset          | [ ]                | [ ]                 |
| fxFlexOrder           | [ ]                | [ ]                 |
| fxFlexAlign           | [ ]                | [ ]                 |
| fxFlexFill            | [ ]                | [ ]                 |

## How to use it localy

1. Clone the project via `git clone git@github.com:NIPE-Solutions/flex-layout-migrator.git`
2. Navigate to the project folder via `cd flex-layout-migrator`
3. Install the dependencies via `npm ci`
4. Run the project via `npm run start -- ./path/to/your/input/folder ./path/to/your/output/folder --target <tailwind|plain-css>`

## Installation

Install the package globally using npm:

```bash
npm install -g @ng-flex/layout-migrator
```

## Usage

After installing the package, you can use the fxMigrate command to start the migration process. Here is a basic example:

```bash
fxMigrate --input ./path/to/your/input/folder --output ./path/to/your/output/folder
```

You can also migrate individual files:

```bash
fxMigrate --input ./path/to/your/input/file.html --output ./path/to/your/output/file.html
```

## Options

You can customize the migration process using the following options:

- --input: The path to the input folder or file.
- --output: The path to the output folder or file.
- --target <target>: Which converter should be used (tailwind|plain-css)

## Contributing

We appreciate any contributions to improve the Angular Flex-Layout Migrator and make it more useful for the community. If you would like to contribute to this project, please follow the steps below:

1. **Fork the repository**: Click on the "Fork" button at the top-right corner of the repository page. This creates a copy of the repository in your GitHub account.

2. **Clone the forked repository**: Clone the forked repository to your local machine using the following command, replacing <your_username> with your GitHub username:

```bash
git clone https://github.com/<your_username>/flex-layout-migrator.git
```

3. **Create a new branch**: Navigate to the cloned repository's directory on your local machine and create a new branch for your changes. Use a descriptive name for your branch:

```bash
cd flex-layout-migrator
git checkout -b feature/<my-feature-branch>
```

4. **Make your changes**: Implement your changes, additions, or bug fixes in the new branch. Make sure to follow the project's coding style and test your changes thoroughly.

5. **Commit your changes**: Commit your changes to the new branch with a descriptive commit message:

```bash
git add .
git commit -m "Add a new feature"
```

6. **Push your changes**: Push the changes to your forked repository on GitHub:

```bash
git push origin feature/<my-feature-branch>
```

7. **Submit a pull request**: Navigate to the original repository's GitHub page and click on the "Pull requests" tab. Click on the "New pull request" button and choose your forked repository and the feature branch as the "compare" option. Fill out the pull request form with a clear description of your changes and submit it.

Please ensure your changes do not introduce any breaking changes or conflicts with the existing codebase. Also, consider adding unit tests for any new features or bug fixes to ensure their reliability and maintainability.

We will review your pull request and provide feedback as necessary. Once your changes are approved and merged, they will become part of the project.

Thank you for considering contributing to the Angular Flex-Layout Migrator!

## License

This project is licensed under the MIT License.
