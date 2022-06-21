import chalk from 'chalk';
import * as fs from 'fs';
import path from 'path';
import _ from 'lodash';
import xlsx from 'xlsx'
import { fileURLToPath } from 'url';
// const chalk = require('chalk');


class Logger {
    /** @param {String} logContent */
    error(logContent) {
        console.log(chalk.redBright(logContent));
    }
    /** @param {String} logContent */
    info(logContent) {
        console.log(chalk.cyanBright(logContent));
    }
    /** @param {String} logContent */
    warning(logContent) {
        console.log(chalk.yellowBright(logContent));
    }
    /** @param {String} logContent */
    success(logContent) {
        console.log(chalk.greenBright(logContent));
    }
    /** @param {String} logContent */
    debug(logContent) {
        console.log(chalk.blueBright(logContent));
    }
}


class Operations
{
    /**
     * 
     * @param {boolean} noOperationRequired
     * @param {boolean} del 
     * @param {Object} replace 
     * @param {Object} rename 
     */
    constructor(noOperationRequired, del, replace, rename){
        this.noOperationRequired = noOperationRequired;
        this.del = del;
        this.replace = replace;
        this.rename = rename;
    }
}

class Node {
    /**
     * 
     * @param {String} name 
     * @param {Operations} operations 
     * @param {Boolean} isDirectory 
     * @param {Object} directoryContent 
     */
    constructor(name, location, operations, isDirectory, directoryContent) {
        /** @type String */
        this.name = name;
        /** @type Operations */
        this.operations = operations;
        /** @type String */
        this.isDirectory = isDirectory;
        /** @type Object */
        this.directoryContent = directoryContent;
        /** @type String */
        this.location = location;
    }
}

class ReplaceAction {
    constructor(oldString, newString, matchWholeWord, isRegex) {
        /** @type String */
        this.oldString = oldString;
        /** @type String */
        this.matchWholeWord = matchWholeWord;
        /** @type Boolean */
        this.isRegex = isRegex;
        /** @type String */
        this.newString = newString;
    }
}


/*****************************************************************************************************************************************/
const logger = new Logger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
    
const filePathSeparator = path.sep;
const replaceStringsSheetName = 'ReplaceStrings';
const workbook = xlsx.readFile('whitelabel.xlsx');
const fileFolderPathHeader = 'Search In';
const rootPathSheet = xlsx.utils.sheet_to_json(workbook.Sheets['plugin']);
const renameSheet = xlsx.utils.sheet_to_json(workbook.Sheets['Rename']);
const replaceStringsSheet = xlsx.utils.sheet_to_json(workbook.Sheets[replaceStringsSheetName]);


const pluginRootPath = rootPathSheet[0]['Root Path'];
const pluginFolderName = path.basename(pluginRootPath);

if(!pluginRootPath) {
    throw new Error('Plugin Root Path Expected!');
}

const treeWithoutAnyOperation = prepareTree(pluginRootPath, pluginFolderName, true);
const treeWithReplaceOperation = addAllReplaceOperationsToTree(treeWithoutAnyOperation, pluginFolderName, replaceStringsSheet);
if(treeWithReplaceOperation)
// const treeWithRenameOperation = addAllRenameOperationToTree(treeWithReplaceOperation, pluginFolderName, renameSheet);

fs.writeFileSync(__dirname + filePathSeparator+"Directory.json", JSON.stringify(treeWithRenameOperation));

logger.success('Build Completed!!')

function prepareTree(location, name, isRoot){
    const operations = new Operations(true, false, {required: false}, {required:false});
    const stats = fs.statSync(location);
    const node = new Node(name, location, operations, true, {});
    
    node.isDirectory = stats.isDirectory()
    if(node.isDirectory) {
        const files = fs.readdirSync(location)
        for(let index = 0; index < files.length ; index++){
            node.directoryContent[files[index]] = prepareTree(location + filePathSeparator + files[index], files[index], false);
        }
    }
    if(isRoot) {
        const tree = {};
        tree[name] = node;
        return tree;
    }
    return node;
}

//TODO: Need to correct it out
function traverseBuildTree(dir)
{
    const entries = Object.entries(dir).map(entry => {
        const key = entry[0];
        
        /** @type Node */
        const value = entry[1];
        // console.log(value);
        traverseBuildTree(value.directoryContent);
    });
}

/**
 * 
 * @param  parentNodeDirectoryContent 
 * @param {Array<Strings>} location 
 * @param {Object} actionInfo 
 * @param {String} logPrefix 
 * @returns 
 */
function traverseToNodeAndAddReplaceAction(parentNodeDirectoryContent, location, actionInfo, logPrefix){
    const currentEntity = location.shift();
    // logger.debug('currentEntity => '+currentEntity);
    
    const resultObject = {
        updatedDirectoryContent: parentNodeDirectoryContent,
        error:false,
        noOperationRequired: true
    }
    
    if(!currentEntity.trim()){
        logger.error(`\n\n${logPrefix} Error: Invalid path format\n\n`);
        resultObject.error = true;
        
    }

    /** @type Node */
    const currentNode = parentNodeDirectoryContent[currentEntity];
    // logger.debug(currentNode);
    
    // logger.debug(JSON.stringify(parentNodeDirectoryContent));
    if(!currentNode  && !resultObject.error) {
        logger.error(`\n\n${logPrefix} Error: Invalid path\n\n`);
        resultObject.error = true;
        
    }
    /* it is not the last node */
    if(!resultObject.error){
        // console.log('Reached inside IF error');
        // logger.debug(currentNode);
        
        // currentNode.operations.noOperationRequired = false;
        if(!_.isEmpty(location)){
            const childDirTraverseAndReplaceOpResult = traverseToNodeAndAddReplaceAction(currentNode.directoryContent, location, actionInfo, logPrefix);
            if(!childDirTraverseAndReplaceOpResult.error){
                currentNode.directoryContent = childDirTraverseAndReplaceOpResult.updatedDirectoryContent;
                currentNode.operations.noOperationRequired = childDirTraverseAndReplaceOpResult.noOperationRequired;
                parentNodeDirectoryContent[currentEntity] = currentNode;
                resultObject.updatedDirectoryContent = parentNodeDirectoryContent;
                resultObject.noOperationRequired = childDirTraverseAndReplaceOpResult.noOperationRequired;
            }
        }
        else
        {
            const isFileExtensionFilterApplied = actionInfo.isFileExtensionFilterApplied;
            if(currentNode.isDirectory && actionInfo.isFileExtensionFilterApplied){
                logger.warning(`\n${logPrefix} Warning: Ignoring the file-extension filter. File extension filters are only applied on folders`);
            }
            const currentAction = actionInfo.replaceAction;
            const extensionFilterArr = actionInfo.extensionFilterArr;
            const isolatedDirectoryContent = {};
            isolatedDirectoryContent[currentEntity] = currentNode;
            const replaceActionResult = addReplaceActionInAllChildNodesWhichIsFIle(isolatedDirectoryContent, currentAction, isFileExtensionFilterApplied, extensionFilterArr);
            resultObject.noOperationRequired = replaceActionResult.noOperationRequired; 
            parentNodeDirectoryContent[currentEntity] = replaceActionResult.tree[currentEntity];
            resultObject.updatedDirectoryContent = parentNodeDirectoryContent;
        }
    }

    return resultObject;
}

function addReplaceActionInAllChildNodesWhichIsFIle(directoryContent, replaceAction, isFileExtensionFilterApplied, extensionFilterArr)
{
    const result = {noOperationRequired : true, tree: directoryContent};
    for (const key in directoryContent) {
        if (Object.hasOwnProperty.call(directoryContent, key)) {
            /** @type Node */
            const currentNode = directoryContent[key];
            const currentNodeOperations = currentNode.operations;
            
            if(currentNode.isDirectory){
                const childDirectoryResult = addReplaceActionInAllChildNodesWhichIsFIle(currentNode.directoryContent,replaceAction, isFileExtensionFilterApplied, extensionFilterArr);
                currentNode.directoryContent = childDirectoryResult.tree;
                currentNodeOperations.noOperationRequired = childDirectoryResult.noOperationRequired;
            }
            else {
                const currentFileExt = path.extname(currentNode.location);
                if(!isFileExtensionFilterApplied || contains(extensionFilterArr,currentFileExt)){
                    let actions = [];
                    if(currentNodeOperations.replace.required){
                        actions = currentNodeOperations.replace.actions;
                        if(!contains(actions, replaceAction)){
                            actions.push(replaceAction);
                        }
                    }
                    else {
                        currentNodeOperations.replace.required = true;
                        currentNodeOperations.noOperationRequired = false;
                        actions.push(replaceAction);
                    }    
                    currentNodeOperations.replace.actions = actions;
                }
            }
            currentNode.operations = currentNodeOperations;
            directoryContent[key] = currentNode;
            result.noOperationRequired = result.noOperationRequired && currentNodeOperations.noOperationRequired;
        }
    }
    result.tree = directoryContent;
    return result;
}


/**
 * 
 * @param {Array<object>} arr 
 * @param {object} element 
 */
function contains(arr, element){
    for(let index = 0; index<arr.length; index++){
        if(_.isEqual(arr[index],element)) {
            return true;
        }
    }
    return false;
}

/**
 * 
 * @param {Object} tree
 * @param {Array<Object>} replaceStrings 
 */
function addAllReplaceOperationsToTree(tree, root, replaceStrings) {
    let isError = false;
    for(let rowIndex = 0; rowIndex<replaceStrings.length ; rowIndex++) {
        
        // logger.info('\n\n***************************' + 'ITERATION COUNT: ' + rowIndex + '*************************************\n\n');
        const replaceStringsRow = replaceStrings[rowIndex];
        const location = replaceStringsRow[fileFolderPathHeader];
        const logPrefix = replaceStringsSheetName+'(sheet) ' + '| Row:' + (rowIndex+2) + ' | ' + ' Column Content: ' + location + ' => ';
        const trimmedLocation = location.trim();
        const normalizedLocation = path.normalize(trimmedLocation);
        const filePathAsArray = normalizedLocation.split(filePathSeparator);
        if(!location){
            logger.error(logPrefix + ' Error: Invalid Path');
            break;
        }
        // console.log(filePathAsArray);
        if(normalizedLocation !== location) {
            logger.warning('\n'+logPrefix + `Warning: Path has been changed from '${location}' to '${normalizedLocation}' after path normalization`)
        }
        

        /** @type String */
        const extensionFilters = replaceStringsRow.fileExtensions.trim();
        const actionInfo = {isFileExtensionFilterApplied: false, extensionFilterArr: ['*']};
        if(extensionFilters){
            const extensionFilterArr = extensionFilters.split(',').map( extension => extension.trim());
            if(!validateArrayOfExtensions(extensionFilterArr)) {
                logger.error(replaceStringsSheetName+'(sheet) ' + '| Row:' + (rowIndex+2) + ' | ' + ' Column Content: ' + extensionFilters + ' => ' + 'Invalid Extension filter');
                break;
            }
            actionInfo.isFileExtensionFilterApplied = extensionFilterArr.reduce((required,extension)=>{
                if(extension === '*') {
                    logger.warning('\n'+replaceStringsSheetName+'(sheet) ' + '| Row:' + (rowIndex+2) + ' | ' + ' Column Content: ' + extensionFilters + ' => ' + 'Found * in extension filter. All files will be having the impact on the directory.');
                    return false;
                }
                return required;
            },true)
            if(actionInfo.isFileExtensionFilterApplied){
                actionInfo.extensionFilterArr = extensionFilterArr;
            }
        }

        if(!replaceStringsRow.oldString){
            logger.error(logPrefix + 'Invalid Old String value');
            break;
        }
        const replaceAction = new ReplaceAction(replaceStringsRow.oldString,replaceStringsRow.newString, replaceStringsRow.matchWholeWord, replaceStringsRow.isRegex);
        actionInfo.replaceAction = replaceAction;
        const resultObject = traverseToNodeAndAddReplaceAction(tree, filePathAsArray, actionInfo, logPrefix);
        // logger.debug(JSON.stringify(tree));
        if(!resultObject.error){
            tree = resultObject.updatedDirectoryContent;
        }else{
            isError = true;
        }
        
    }
    return isError || tree;
}

/**
 * 
 * @param {Array<String>} extensionArray 
 */
function validateArrayOfExtensions(extensionArray) {
    return extensionArray.reduce(
        /** @param {Boolean} validationResult @param {String} extension */
        (validationResult, extension)=>{
        
        const itIsAsterix = extension === '*';
        const lastIndexOfDot = extension.lastIndexOf('.');
        const endsWithDot = extension.endsWith('.');
        const startsWithDot = extension.startsWith('.');
        const indexOfSpace = extension.indexOf(' ');
        const dotIsPresent = (lastIndexOfDot !== -1);
        const spaceIsNotPreset = (indexOfSpace === -1)
        const isValidExtension = itIsAsterix || (dotIsPresent && spaceIsNotPreset && !endsWithDot && startsWithDot);
        return validationResult && isValidExtension;
    }
    ,true);
}

function addAllRenameOperationToTree(tree, root, renameArray) {
    return tree;
}

/**
 * Rename Array : {
 *  oldName:
 *  newName:
 *  path:
 * }
 */