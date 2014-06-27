angular.module('mngr.utility').factory('utility',function(data) {
    var utility = {
        // ecodocs: returns the arguments passed to the angular 'filter'
        filterArgs: function(filter){
            var args = null;
            switch(filter.type){
                case 'text':
                    if(filter.value){
                        args = {};
                        args[filter.model] = filter.value;
                    }

                    break;

                case 'number':
                    if(filter.value || filter.value===0){
                        args = function(item){
                            var result = false;
                            var modelValue = item[filter.model]?item[filter.model]:0;
                            var filterValue = filter.value;
                            if(modelValue){
                                switch(filter.operand){
                                    case '<':
                                        result = (modelValue <= filterValue);
                                        break;

                                    case '>':
                                        result = (modelValue >= filterValue);
                                        break;

                                    case '><':
                                        if(filter.value2 || filter.value2===0){
                                            result = (modelValue >= filterValue && modelValue <= filter.value2);
                                        }
                                        else{
                                            result = (modelValue===filterValue);
                                        }
                                        break;

                                    case '=':
                                        result = (modelValue===filterValue);
                                        break;

                                    default:
                                        result = (modelValue===filterValue);
                                        break;
                                }
                            }
                            return result;
                        };
                    }
                    break;

                case 'select':
                    args = function(item){
                        var result = false;
                        var modelValue = item[filter.model];
                        if(modelValue){
                            if(angular.isArray(modelValue)){
                                // ecodocs: loop through each selected value (assumes <select multiple>)
                                angular.forEach(filter.value, function(checkValue){
                                    if(!result && modelValue.indexOf(checkValue)!==-1){
                                        result = true;
                                    }
                                });
                            }
                            else{
                                // ecodocs: check if modelValue is any of the selected values (assumes <select multiple>)
                                if(filter.value.indexOf(modelValue)!==-1){
                                    result = true;
                                }
                            }

                        }
                        return result;
                    };
                    break;

                // ecodocs: add other filter.types
            }
            return args;
        },

        // login callback, account is the firebase authentication account
        userAuthenticated: function(account){

        }
    };

    return utility;
});