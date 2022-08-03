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

class OperationAdder {
    /**
     * Operation Adder class
     * @param {Object} operands Array of operands need to pass for operation
     */
    constructor(operands)
    {
        /** @type Array */
        this.operands = operands;
    }
}

class RenameOperationAdderToNode extends OperationAdder{
    /**
     * @param {Operations} currentNodeOperations 
     * @param {Logger} renameLogger 
     * @returns {Operations} Updated operations content
     */
    execute(currentNodeOperations, renameLogger){
        const newName = this.operands.newName;
        if(!newName || !newName.trim()) {
            const errorMessage = 'Undefined New Name\n';
            renameLogger.error(errorMessage);
            throw new Error(errorMessage);
        }
        if(currentNodeOperations.rename.required) {
            const errorMessage = 'Found a duplicate entry\n';
            renameLogger.error(errorMessage);
            throw new Error(errorMessage);
        }
        currentNodeOperations.noOperationRequired = false;
        currentNodeOperations.rename.required = true;
        currentNodeOperations.rename.newName = newName;
        return currentNodeOperations;    
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

export {
    Operations, Node, RenameOperationAdderToNode, ReplaceAction
}