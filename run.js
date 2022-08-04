import * as fs from 'fs';
import path from 'path';
import _ from 'lodash';
import {Node} from './Model/Operations.js';
import Logger from './Model/Logger.js';

const jsonHashMapTree = fs.readFileSync('./Directory.json');
const logger = new Logger();
const lock = []

traverseAndPerformOperations(JSON.parse(jsonHashMapTree),false)

/**
 * Traverses HashMap in recursive way and call specific operation to perform for each node.
 * @param {{string: Node}} treeNode
 */
function traverseAndPerformOperations(treeNode,parentDirLockKey) {
    let index = 0
    if(treeNode) {
        for (const key in treeNode) {
            if (Object.hasOwnProperty.call(treeNode, key)) {
                /** @type Node */
                const currentNode = treeNode[key];
                const dirLockKey = currentNode.location+'dir';
                const replaceKey = currentNode.location+'replace';
                const currentNodeOperations = currentNode.operations;

                if(currentNodeOperations.noOperationRequired) {
                    continue;
                }

                /** Rename should be done last and delete should be done first to avoid conflict in operations */
                if(currentNodeOperations.del) {
                    deleteNode(currentNode);
                    continue;
                }

                if(!currentNode.isDirectory) {
                    if(currentNodeOperations.replace.required) {
                        lock[replaceKey] = true;
                        replaceStringInFile(currentNode.location, currentNodeOperations.replace.actions, replaceKey);
                    }
                }
                else {
                    lock[dirLockKey] = true;
                    traverseAndPerformOperations(currentNode.directoryContent, dirLockKey);
                }

                if(currentNodeOperations.rename.required) {
                    if((currentNode.isDirectory && !lock[dirLockKey]) || (!currentNode.isDirectory && !lock[replaceKey]))
                        renameNode(currentNode.location, currentNodeOperations.rename.newName, parentDirLockKey);
                    else{
                        logger.info(`Failed to acquire lock for renaming of '${currentNode.location}'. Trying again... `);
                        const timerId = setInterval(()=>{
                            if((currentNode.isDirectory && !lock[dirLockKey]) || (!currentNode.isDirectory && !lock[replaceKey]))
                            {
                                clearInterval(timerId);
                                renameNode(currentNode.location, currentNodeOperations.rename.newName, parentDirLockKey);
                            }
                            else {
                                logger.info(`Failed to acquire lock for renaming of '${currentNode.location}'. Trying again... `);
                            }
                        },6000)
                    }
                }
            }
        }

    }
}


/**
 * 
 * @param {Node} node 
 */
function deleteNode(node) {
    if (node.isDirectory) {
        //TODO: do something to delete directory
        fs.rm(node.location,{recursive:true}, function(err) {
            if(err) {

                if(err.code === "ENOENT") 
                    logger.error(`${node.location} folder cannot be deleted. Reason: No such folder exists`)
                else
                    logger.error(`${node.location} folder cannot be deleted. Error code: ${err.code}`)
                throw err;
            }
            logger.success(`'${node.location}' folder deletion is successful`)       
        });
    }
    else {
        //TODO: do something to delete file
        fs.unlink(node.location,(err)=>{
            if(err) {
                if(err.code === "ENOENT") 
                    logger.error(`${node.location} file cannot be deleted. Reason: No such file exists`)
                else
                    logger.error(`${node.location} file cannot be deleted. Error code: ${err.code}`)
                throw err;
            }
            logger.success(`'${node.location}' file deletion is successful`)       
        })
    }
}

/**
 * 
 * @param {String} fileOrFolderPath Old folder location
 * @param {String} newName New name of folder
 * @param {String} lockKeyToRelease Key to release lock after completion of operationnewName
 */
function renameNode(fileOrFolderPath, newName, lockKeyToRelease) {
    
    const newFolderPath = path.normalize(path.join(path.dirname(fileOrFolderPath),newName));
    
    fs.rename(fileOrFolderPath, newFolderPath, (err) => {
        if(err) {
            if(err.code = 'ENOTEMPTY') {
                logger.error(`${newName} already exists. Rename of '${fileOrFolderPath}' to '${newFolderPath}' is failed`);
            }
            else{
                logger.error(`Rename of '${fileOrFolderPath}' to '${newName}' is failed`);
                throw err;
            }
        }
        logger.success(`Rename of '${fileOrFolderPath}' to '${newName}' is successfully done`);
        lock[lockKeyToRelease] = false;
    });
}

/**
 * 
 * @param {String} node 
 * @param {Array<object>} replaceList
 * @param {String} lockKeyToRelease Key to release lock after completion of operationnewName
 */
function replaceStringInFile(filePath, replaceList, lockKeyToRelease) {
    //TODO: do something to replace file
    fs.readFile(filePath,'utf-8', (err, data)=>{
        
        if(err) {
            logger.error(`Unable to read file '${filepath}'`)
            throw err;
        }
        
        for(let i=0;i<replaceList.length; i++) {
            const {oldString, newString, matchWholeWord, isRegex} = replaceList[i];

            let stringToSearch = oldString;
            logger.debug(matchWholeWord);
            if(matchWholeWord) {
                stringToSearch = new RegExp(`\\b${oldString}\\b`,'\ig');
            }
            if(isRegex) {
                stringToSearch = new RegExp(oldString,'\ig');
            }
            logger.debug(stringToSearch);
            data = data.replaceAll(stringToSearch, newString);
        }

        fs.writeFile(filePath, data, "utf-8", (err) => {
            if(err) {
                logger.error(`Unable to write in file '${filePath}' after string replacements`)
                throw err;
            }
            lock[lockKeyToRelease] = false;
            logger.success(`Replacement is successful for file '${filePath}'`)       
        })
    });
    

}