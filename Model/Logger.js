import chalk from 'chalk';

class Logger {

    constructor(prefix='', contentTagRequired=false) {
        this.prefix = prefix;
        this.contentTagRequired = contentTagRequired;
    }

    /** @param {String} logContent @param {String} tag @returns String*/
    getContent(logContent, tag){
        let content = '';
        if(this.contentTagRequired) {
            content = tag;
        }
        content = content + this.prefix + logContent;
        return content;
    }

    /** @param {String} logContent */
    error(logContent) {
        console.log(chalk.redBright(this.getContent(logContent, 'Error: ')));
    }
    /** @param {String} logContent */
    info(logContent) {
        console.log(chalk.cyanBright(this.getContent(logContent, 'ℹ Info: ')));
    }
    /** @param {String} logContent */
    warning(logContent) {
        console.log(chalk.yellowBright(this.getContent(logContent, '⚠ Warning: ')));
    }
    /** @param {String} logContent */
    success(logContent) {
        console.log(chalk.greenBright(this.getContent(logContent, '✔ ')));
    }
    /** @param {String} logContent */
    debug(logContent) {
        console.log(chalk.blueBright(this.getContent(logContent, 'Debug: ')));
    }
}

export default Logger