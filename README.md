## Table of Contents

- [Angular Flex-Layout Migration Tool](#angular-flex-layout-migration-tool)
  - [Features](#features)
  - [Status](#status)
  - [How to use it localy](#how-to-use-it-localy)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Options](#options)
  - [Contributing](#contributing)
  - [License](#license)

# Angular Flex-Layout Migration Tool

<a id="angular-flex-layout-migration-tool"></a>

[![Development Status](https://img.shields.io/badge/status-under%20development-critical)](https://github.com/NIPE-Solutions/flex-layout-migrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

This tool assists in migrating projects that use the deprecated Angular Flex-Layout library to CSS classes. The package is designed to be as flexible and customizable as possible to accommodate different migration scenarios. Contributions are highly welcome!

**Please note that this project is currently under development and not yet stable. Use it at your own risk.**

The Idea of this project is to migrate the Angular Flex-Layout attributes to CSS classes, CSS styles or whatever is needed. The current plan is to implement the conversion to Tailwind and Plain CSS but it should be possible to implement other converters as well. Right now the focus relies on Tailwind and the most used attributes. If you need a specific attribute, feel free to open an issue or implement it yourself and create a pull request.

## Features <a name="features"></a>

- Scans and processes HTML files or entire directories.
- Migrates Angular Flex-Layout attributes to CSS classes.
- Configurable attribute-to-class mapping using a JSON configuration file.
- Support for handling attribute values.

## Status <a name="status"></a>

The following features are currently available:

- Scans and processes HTML files or entire directories.
- Migrates Angular Flex-Layout attributes according to the implementation of the specific attribute converter (See available converters).

### Flex-Layout Attributes

The following Angular Flex-Layout attributes need to be migrated:

| Flex-Layout Attribute | Supported Values                                                                                              | Breakpoint Modifiers Supported |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| fxLayout              | row, column, row-reverse, column-reverse                                                                      | :white_check_mark:             |
| fxLayoutAlign         | start start, start center, start end, center start, center center, center end, end start, end center, end end | :white_check_mark:             |
| fxLayoutGap           | e.g. 5px, 10px, 1rem, 2rem                                                                                    | :white_check_mark:             |
| fxFlex                | e.g. 0 1 auto, 1 1 0%, 2 2 0%                                                                                 | :white_check_mark:             |
| fxFlexOffset          | e.g. 5px, 10px, 1rem, 2rem                                                                                    | :white_check_mark:             |
| fxFlexOrder           | e.g. 0, 1, 2, 3                                                                                               | :white_check_mark:             |
| fxFlexAlign           | start, center, end, stretch, baseline                                                                         | :white_check_mark:             |
| fxFlexFill            | No specific values, simply fills available space                                                              | :x:                            |

All attributes marked with :white_check_mark: do support breakpoint modifiers. This means that you can specify different values for different breakpoints.
The following breakpoints are supported:

| Breakpoint | Description              |
| ---------- | ------------------------ |
| sm         | Small                    |
| md         | Medium                   |
| lg         | Large                    |
| xl         | Extra Large              |
| lt-sm      | Less than Small          |
| lt-md      | Less than Medium         |
| lt-lg      | Less than Large          |
| lt-xl      | Less than Extra Large    |
| gt-xs      | Greater than Extra Small |
| gt-sm      | Greater than Small       |
| gt-md      | Greater than Medium      |
| gt-lg      | Greater than Large       |

Here is an example of how many different combinations are possible for the `fxFlex` attribute:

| Attribute | Breakpoint | Example Values     | Description                                                                        |
| --------- | ---------- | ------------------ | ---------------------------------------------------------------------------------- |
| fxFlex    |            |                    | Grow and shrink based on available space, equally sharing it with other flex items |
|           |            | 1 1 auto           | Flex grow 1, flex shrink 1, flex-basis auto                                        |
|           |            | 2 2 0%             | Flex grow 2, flex shrink 2, flex-basis 0%                                          |
|           | sm         | 1 1 auto           | Small: Flex grow 1, flex shrink 1, flex-basis auto                                 |
|           | md         | 2 2 0%             | Medium: Flex grow 2, flex shrink 2, flex-basis 0%                                  |
|           | lg         | [flexValue]        | Large: Use a dynamic value for the flex property                                   |
|           | gt-sm      | 1 1 auto, [custom] | Greater than Small: Custom or dynamic value                                        |

Another example for the use in Angular templates:

```html

<div
  fxFlex
  fxFlex="1 1 auto"
  fxFlex.sm="1 1 auto"
  fxFlex.md="2 2 0%"
  [fxFlex.lg]="flexValue"
  [fxFlex.gt-sm]="custom"
>
  <!-- Content -->
</div

```

For more information about the Angular Flex-Layout attributes, please refer to the [official documentation](https://github.com/angular/flex-layout/wiki/fxLayout-API).

### Available Converters

| Flex-Layout Attribute | Tailwind Converter | Plain-CSS Converter |
| --------------------- | ------------------ | ------------------- |
| fxLayout              | :x:                | :x:                 |
| fxLayoutAlign         | :x:                | :x:                 |
| fxLayoutGap           | :x:                | :x:                 |
| fxFlex                | :x:                | :x:                 |
| fxFlexOffset          | :x:                | :x:                 |
| fxFlexOrder           | :x:                | :x:                 |
| fxFlexAlign           | :x:                | :x:                 |
| fxFlexFill            | :x:                | :x:                 |

## How to use it localy <a name="how-to-use-it-localy"></a>

1. Clone the project via `git clone git@github.com:NIPE-Solutions/flex-layout-migrator.git`
2. Navigate to the project folder via `cd flex-layout-migrator`
3. Install the dependencies via `npm ci`
4. Run the project via `npm run start -- ./path/to/your/input/folder ./path/to/your/output/folder --target <tailwind|plain-css>`

## Installation <a name="installation"></a>

Install the package globally using npm:

```bash
npm install -g @ng-flex/layout-migrator
```

## Usage <a name="usage"></a>

After installing the package, you can use the fxMigrate command to start the migration process. Here is a basic example:

```bash
fxMigrate --input ./path/to/your/input/folder --output ./path/to/your/output/folder
```

You can also migrate individual files:

```bash
fxMigrate --input ./path/to/your/input/file.html --output ./path/to/your/output/file.html
```

## Options <a name="options"></a>

You can customize the migration process using the following options:

- --input: The path to the input folder or file.
- --output: The path to the output folder or file.
- --target <target>: Which converter should be used (tailwind|plain-css)

## Contributing <a name="contributing"></a>

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

## License <a name="license"></a>

This project is licensed under the MIT License.
