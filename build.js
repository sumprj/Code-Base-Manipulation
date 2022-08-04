import * as fs from 'fs';
import path from 'path';
import _ from 'lodash';
import xlsx from 'xlsx'
import { fileURLToPath } from 'url';
import {Operations, Node, RenameOperationAdderToNode, ReplaceAction} from './Model/Operations.js';
import Logger from './Model/Logger.js';

/*****************************************************************************************************************************************/
const logger = new Logger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const spreadSheetFileName = 'whitelabel.xlsx';

const filePathSeparator = path.sep;

//Sheet Names
const replaceStringsSheetName = 'ReplaceStrings';
const pluginSheetName = 'plugin';
const renameSheetName = 'Rename';
const deleteSheetName = 'Delete'

const workbook = xlsx.readFile(spreadSheetFileName);

if(!workbook) {
    throw new Error(`The spreadsheet '${spreadSheetFileName}' is not Found. Expected the spreadsheet in '${__dirname}' folder`);
}

//Sheet column headers
const fileFolderPathHeader = 'Search In';
const rootPathHeader = 'Root Path';

const rootPathSheet = workbook.Sheets[pluginSheetName];
const renameSheet = workbook.Sheets[renameSheetName];
const replaceStringsSheet = workbook.Sheets[replaceStringsSheetName];
const deleteSheet = workbook.Sheets[deleteSheetName];

if(!replaceStringsSheet) {
    throw new Error(`'${replaceStringsSheetName}' sheet does not exist`);
}

if(!renameSheet) {
    throw new Error(`'${renameSheetName}' sheet does not exist`);
}

if(!deleteSheet) {
    throw new Error(`'${deleteSheetName}' sheet does not exist`);
}

if(!rootPathSheet) {
    throw new Error(`'${pluginSheetName}' sheet does not exist`);
}

//Sheet Content to JSON
const rootPathSheetAsArray = xlsx.utils.sheet_to_json(rootPathSheet);
const renameSheetAsArray = xlsx.utils.sheet_to_json(renameSheet);
const replaceStringsSheetAsArray = xlsx.utils.sheet_to_json(replaceStringsSheet);
const deleteSheetAsArray = xlsx.utils.sheet_to_json(deleteSheet);

if(!rootPathSheetAsArray[0] || !rootPathSheetAsArray[0][rootPathHeader]) {
    throw new Error(`Invalid value in the spreadsheet '${spreadSheetFileName}'. Expected value in '${pluginSheetName}' sheet under '${rootPathHeader}' column!`);
}
const pluginRootPath = rootPathSheetAsArray[0][rootPathHeader];
const pluginFolderName = path.basename(pluginRootPath);

if(!pluginRootPath) {
    throw new Error('Plugin Root Path Expected!');
}

const treeWithoutAnyOperation = prepareTree(pluginRootPath, pluginFolderName, true);
const treeWithReplaceOperation = addAllReplaceOperationsToTree(treeWithoutAnyOperation, pluginFolderName, replaceStringsSheetAsArray);

const treeWithRenameOperation = addAllRenameOperationToTree(treeWithReplaceOperation, pluginFolderName, renameSheetAsArray);

const treewithDelOp = addAllDeleteOperationsToTree(treeWithRenameOperation, pluginFolderName, deleteSheetAsArray);

fs.writeFileSync(__dirname + filePathSeparator+"Directory.json", JSON.stringify(treewithDelOp));

logger.success('Build Completed!!')

/*****************************************************************************************************************************************/

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
        logger.error(`\n\n${logPrefix} Error: Invalid path. '${currentEntity}' does not exists.'\n\n`);
        resultObject.error = true;
        
    }
    /* it is not the last node */
    if(!resultObject.error){
        if(!_.isEmpty(location)){
            const childDirTraverseAndReplaceOpResult = traverseToNodeAndAddReplaceAction(currentNode.directoryContent, location, actionInfo, logPrefix);
            resultObject.error = childDirTraverseAndReplaceOpResult.error;
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
        

        const actionInfo = {isFileExtensionFilterApplied: false, extensionFilterArr: ['*']};
        /** @type String */
        if(replaceStringsRow.fileExtensions) {
            const extensionFilters = replaceStringsRow.fileExtensions.trim();
            if(extensionFilters){
                const extensionFilterArr = extensionFilters.split(',').map( extension => extension.trim());
                if(!validateArrayOfExtensions(extensionFilterArr)) {
                    logger.error(replaceStringsSheetName+'(sheet) ' + '| Row:' + (rowIndex+2) + ' | ' + ' Column Content: ' + extensionFilters + ' => ' + 'Invalid Extension filter');
                    break;
                }
                actionInfo.isFileExtensionFilterApplied = extensionFilterArr.reduce((required,extension)=>{
                    if(extension === '*') {
                        return false;
                    }
                    return required;
                },true)
                if(actionInfo.isFileExtensionFilterApplied){
                    actionInfo.extensionFilterArr = extensionFilterArr;
                }
                else if (extensionFilterArr.length > 1) {
                    logger.warning('\n'+replaceStringsSheetName+'(sheet) ' + '| Row:' + (rowIndex+2) + ' | ' + ' Column Content: ' + extensionFilters + ' => ' + 'Found * in extension filter. All files will be having the impact on the directory.');
                }
            }
        }
        if(!replaceStringsRow.oldString){
            logger.error(logPrefix + 'Invalid Old String value');
            break;
        }
        const replaceAction = new ReplaceAction(replaceStringsRow.oldString,replaceStringsRow.newString, replaceStringsRow.matchWholeWord, replaceStringsRow.isRegex);
        actionInfo.replaceAction = replaceAction;
        const resultObject = traverseToNodeAndAddReplaceAction(tree, filePathAsArray, actionInfo, logPrefix);
        if(!resultObject.error){
            tree = resultObject.updatedDirectoryContent;
        }else{
            isError = true;
        }
        
    }
    if (isError) {
        throw new Error('Invalid Replace strings Sheet content')
    }
    return tree;
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
    const pathHeader = 'Path';
    const newNameHeader = 'newName';
    let isError = false;
    for(let rowIndex = 0; rowIndex<renameArray.length ; rowIndex++) {
        const renameRow = renameArray[rowIndex];
        const renameLogger = new Logger(`${renameSheetName}(sheet) : Row ${rowIndex+2} => `,true);
        /** @type String */
        const location = renameRow[pathHeader]; 
        const newName = renameRow[newNameHeader];
        const normalizedLocation = path.normalize(location.trim());
        
        if( location !== normalizedLocation){
            renameLogger.warning(`Path is changed from '${location}' to '${normalizedLocation}'`)
        }
        const pathArray = normalizedLocation.split(filePathSeparator);
        const operands = {newName: newName};
        const renameOperationAdderToNode = new RenameOperationAdderToNode(operands);
        const traverseResult = traverseAndAddRenameOperationToNode(tree, pathArray, renameOperationAdderToNode, renameLogger);
        if(traverseResult.error){
            isError = true;
        }
        tree = isError ? tree : traverseResult.tree;
    }
    if (isError) {
        throw new Error('Invalid Rename Sheet content')
    }
    return tree;
}

/**
 * 
 * @param {Object}} tree 
 * @param {Array<Strings>} pathArray 
 * @param {RenameOperationAdderToNode} renameOperationAdderToNode 
 * @param {Logger} renameLogger 
 * @returns 
 */
function traverseAndAddRenameOperationToNode(tree, pathArray, renameOperationAdderToNode , renameLogger) {
    //Start from here
    //TODO: get currentNode traverse to last node and add rename operation to last node, If file extension is changing then show warning and if file or folder doesn't exist then throw error
    const resultObj = {error:false, tree:tree, noOperationRequired:true};
    const currentEntity = pathArray.shift();
    /** @type Node */
    const currentNode = tree[currentEntity];

    if(!currentEntity.trim()){
        renameLogger.error(`Invalid path format\n\n`);
        resultObject.error = true;
    }

    if(!currentNode  && !resultObj.error) {
        renameLogger.error(`Invalid path. '${currentEntity}' does not exists.\n\n`);
        resultObj.error = true;
        
    }
    
    if(!resultObj.error){

        /* it is not the last node */
        if(!_.isEmpty(pathArray)){
            const childDirTraverseAndRenameOpResult = traverseAndAddRenameOperationToNode(currentNode.directoryContent, pathArray, renameOperationAdderToNode, renameLogger);
            resultObj.error = childDirTraverseAndRenameOpResult.error;
            if(!childDirTraverseAndRenameOpResult.error){
                currentNode.directoryContent = childDirTraverseAndRenameOpResult.tree;
                currentNode.operations.noOperationRequired = childDirTraverseAndRenameOpResult.noOperationRequired;
                tree[currentEntity] = currentNode;
                resultObj.tree = tree;
                resultObj.noOperationRequired = childDirTraverseAndRenameOpResult.noOperationRequired;
            }
        }
        else
        {
            currentNode.operations = renameOperationAdderToNode.execute(currentNode.operations,renameLogger);
            if(!currentNode.isDirectory){
                const currentExt = path.extname(currentNode.location);
                const newExt = path.extname(renameOperationAdderToNode.operands.newName);
                if(currentExt !== newExt)
                    renameLogger.warning(`After renaming the file '${currentNode.name}' to '${renameOperationAdderToNode.operands.newName}', file extension will be modified!!\n`);
            }
            resultObj.noOperationRequired = currentNode.operations.noOperationRequired;
            tree[currentEntity] = currentNode;
            resultObj.tree = tree;
        }
    }

    return resultObj;
}

function addAllDeleteOperationsToTree(tree, root, delArray) {
    console.log(delArray);
    const pathHeader = 'Path';
    let isError = false;
    for(let rowIndex = 0; rowIndex<delArray.length ; rowIndex++) {
        const delRow = delArray[rowIndex];
        const deleteLogger = new Logger(`${deleteSheetName}(sheet) : Row ${rowIndex+2} => `,true);
        /** @type String */
        const location = delRow[pathHeader]; 
        const normalizedLocation = path.normalize(location.trim());
        
        if( location !== normalizedLocation){
            deleteLogger.warning(`Path is changed from '${location}' to '${normalizedLocation}'`)
        }
        const pathArray = normalizedLocation.split(filePathSeparator);
        
        const traverseResult = traverseAndAddDeleteOperationToNode(tree, pathArray, deleteLogger);
        if(traverseResult.error){
            isError = true;
        }
        tree = isError ? tree : traverseResult.tree;
    }
    if (isError) {
        throw new Error('Invalid Delete Sheet content')
    }
    return tree;
}

function traverseAndAddDeleteOperationToNode(tree, pathArray , deleteLogger) {
        //Start from here
    //TODO: get currentNode traverse to last node and add rename operation to last node, If file extension is changing then show warning and if file or folder doesn't exist then throw error
    const resultObj = {error:false, tree:tree, noOperationRequired:true};
    const currentEntity = pathArray.shift();
    /** @type Node */
    const currentNode = tree[currentEntity];

    if(!currentEntity.trim()){
        deleteLogger.error(`Invalid path format\n\n`);
        resultObject.error = true;
    }

    if(!currentNode  && !resultObj.error) {
        deleteLogger.error(`Invalid path. '${currentEntity}' does not exists.\n\n`);
        resultObj.error = true;
        
    }
    
    if(!resultObj.error){

        /* it is not the last node */
        if(!_.isEmpty(pathArray)){
            const childDirTraverseAndDelOpResult = traverseAndAddDeleteOperationToNode(currentNode.directoryContent, pathArray, deleteLogger);
            resultObj.error = childDirTraverseAndDelOpResult.error;
            if(!childDirTraverseAndDelOpResult.error){
                currentNode.directoryContent = childDirTraverseAndDelOpResult.tree;
                currentNode.operations.noOperationRequired = childDirTraverseAndDelOpResult.noOperationRequired;
                tree[currentEntity] = currentNode;
                resultObj.tree = tree;
                resultObj.noOperationRequired = childDirTraverseAndDelOpResult.noOperationRequired;
            }
        }
        else
        {
            if(currentNode.operations.del) {
                const errorMessage = 'Found duplicate entry';
                deleteLogger.error(errorMessage);
                throw Error(errorMessage);
            }
            currentNode.operations.del = true;
            currentNode.operations.noOperationRequired = false;
            
            resultObj.noOperationRequired = currentNode.operations.noOperationRequired;
            tree[currentEntity] = currentNode;
            resultObj.tree = tree;
        }
    }

    return resultObj;

}



/**
 * Rename Array : {
 *  oldName:
 *  newName:
 *  path:
 * }
 */