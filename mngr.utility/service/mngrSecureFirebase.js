angular.module('mngr.utility').factory('mngrSecureFirebase',function(Firebase, $firebase, $q, $timeout) {
    // secured replica of $firebase - provides same interface as $firebase() object
    function MngrSecureFirebase(type, user){
        var mngrSecureFirebase = {
            $add: function(value){
                if(this.$secure.fire){
                    return this.$secure.fire.$add(value);
                }
                return this.$secure.addChild(value);
            },
            $remove: function(key){
                if(this.$secure.fire){
                    return this.$secure.fire.$remove(key);
                }
                return this.$secure.removeChild(key);
            },
            $save: function(key){
                if(this.$secure.fire){
                    return this.$secure.fire.$save(key);
                }
                return this.$secure.saveChild(key);
            },
            $child: function(key){
                if(this.$secure.fire){
                    return this.$secure.fire.$child(key);
                }
                return this.$secure.child(key);
            },
            $set: function(value){
                if(this.$secure.fire){
                    return this.$secure.fire.$set(value);
                }
                return null; // if they don't have root access, they cannot $set the root
            },
            $update: function(value){
                if(this.$secure.fire){
                    return this.$secure.fire.$update(value);
                }
                return null; // if they don't have root access, they cannot $update the root
            },
            $getIndex: function(){
                if(this.$secure.fire){
                    return this.$secure.fire.$getIndex();
                }
                return this.$secure.childKeys();
            },
            $transaction: function(updateFn, applyLocally){
                if(this.$secure.fire){
                    return this.$secure.fire.$transaction(updateFn, applyLocally);
                }
                return null; // if they don't have root access, they cannot perform transaction on the root
            },
            $on: function(eventName, handler){
                if(this.$secure.fire){
                    return this.$secure.fire.$on(eventName, handler);
                }
                this.$secure.addEventHandler(eventName, handler);
            },
            $off: function(eventName, handler){
                if(this.$secure.fire){
                    return this.$secure.fire.$off(eventName, handler);
                }
                this.$secure.removeEventHandler(eventName, handler);
            },

            $secure: {
                ref: null,  // Firebase reference
                fire: null, // null unless a user has root access for this type (ie. public or role-access)
                children: {},   // object of child $firebase()'s for user-level access
                type: type,
                user: user,
                eventHandlers: {},
                loading: false,
                child: function(key){
                    if(this.permit(key)){
                        if(!this.children[key]){
                            this.children[key] = $firebase(this.ref.child(key));
                        }
                        return this.children[key];
                    }
                    return null;
                },
                childKeys: function(){
                    return Object.keys(this.children);
                },
                addChild: function(value){
                    // allow adding the child if we have root access or the value's users list contains the user
                    if(this.permit() || (type.access.indexOf('user')!==-1 && angular.isArray(value.users) && value.users.indexOf(this.user.$id)!==-1)){
                        var newID = this.ref.push(value);
                        this.child(newID);
                        return newID;
                    }
                },
                removeChild: function(key){
                    var child = this.child(key);
                    // if we have the child, we have access to remove it
                    if(child){
                        child.$remove();
                    }
                },
                saveChild: function(key){
                    var child = this.child(key);
                    if(child){
                        child.$save();
                    }
                },
                snapshot: function(key, prevChild){
                    // generate a snapshot of the secured data
                    var result = {snapshot: null};
                    if(angular.isUndefined(key)){
                        // no child key specified, generate snapshot of all children
                        result.snapshot = {name: this.type.name, value: {}};
                        angular.forEach(this.children, function(child, key){
                            if(child){
                                result.snapshot.value[key] = mngrSecureFirebase.$secure.snapshotValue(child);
                            }
                        });
                    }
                    else if(this.permit(key)){
                        // snapshot for a specific child
                        var child = this.child(key);
                        if(child){
                            result.snapshot = {name: key, value: mngrSecureFirebase.$secure.snapshotValue(child)};
                            if(angular.isDefined(prevChild) && (prevChild===null || this.permit(prevChild))){
                                result.prevChild = prevChild;
                            }
                        }
                    }
                    return result;
                },
                snapshotValue: function(child){
                    // generates the value for a snapshot of a single child
                    var snapshotValue = null;
                    if(child){
                        var childIndex = child.$getIndex();
                        if(childIndex.length){
                            // handle child with descendants
                            snapshotValue = {};
                            angular.forEach(childIndex, function(childKey){
                                snapshotValue[childKey] = child[childKey];
                            });
                        }
                        else if(angular.isDefined(child.$value)){
                            // handle child with literal value
                            snapshotValue = child.$value;
                        }
                    }
                    return snapshotValue;
                },
                handleEvent: function(eventName, arg1, arg2){
                    if(this.eventHandlers[eventName]){
                        angular.forEach(this.eventHandlers[eventName], function(handler){
                            if(angular.isDefined(arg1) && angular.isDefined(arg2)){
                                handler(arg1, arg2);
                            }
                            else if(angular.isDefined(arg1)){
                                handler(arg1);
                            }
                            else{
                                handler();
                            }
                        });
                    }
                },
                addEventHandler: function(eventName, handler){
                    if(!this.eventHandlers[eventName]){
                        this.eventHandlers[eventName] = [];
                    }
                    // add the handler if it does not already exist
                    if(this.eventHandlers[eventName].indexOf(handler)===-1){
                        this.eventHandlers[eventName].push(handler);
                    }
                },
                removeEventHandler: function(eventName, handler){
                    if(this.eventHandlers[eventName]){
                        if(angular.isDefined(handler)){
                            var handlerIndex = this.eventHandlers[eventName].indexOf(handler);
                            if(handlerIndex!==-1){
                                // if the specific handler is found, remove it
                                this.eventHandlers[eventName].splice(handlerIndex, 1);

                                if(this.eventHandlers[eventName].length===0){
                                    // no handlers left for this eventName
                                    delete this.eventHandlers[eventName];
                                }
                            }
                        }
                        else{
                            // no handler specified, remove all handlers for this eventName
                            delete this.eventHandlers[eventName];
                        }
                    }
                },
                loadForUser: function(){
                    // loads all children of <type> that user knows about (ie. id's listed in user/<type>)
                    if(this.type.access.indexOf('user')!==-1 && angular.isObject(this.user[this.type.name])){
                        var dataLoaded = {};
                        mngrSecureFirebase.$secure.loading = true;
                        angular.forEach(this.user[this.type.name], function(allowed, key){
                            if(allowed){
                                var dataLoader = $q.defer();
                                dataLoaded[key] = dataLoader.promise;
                                var loadedChild = mngrSecureFirebase.$secure.child(key);
                                loadedChild.$on('loaded', function(){
                                    dataLoader.resolve(loadedChild);
                                });
                            }
                        });
                        $q.all(dataLoaded).then(function(results){
                            // all children are securely loaded for the user
                            console.log('%Secure \''+mngrSecureFirebase.$secure.type.name+'\' loaded and secured for \''+mngrSecureFirebase.$secure.user.name+'\'', 'background: #999; color: #D0E');
                            $timeout(function(){
                                // timeout so final change and child_added events get fired before value and loaded (consistency with stock Firebase event orders)
                                mngrSecureFirebase.$secure.handleEvent('value', mngrSecureFirebase.$secure.snapshot());
                                mngrSecureFirebase.$secure.handleEvent('loaded'); // ecodocs: angularfire event
                                mngrSecureFirebase.$secure.loading = false;
                            });
                        });
                    }
                },
                permit: function(key){
                    var result = false;
                    if(this.publicAllowed()){
                        result = true;
                    }
                    else{
                        angular.forEach(this.type.access, function(access){
                            if(!result){
                                if(access === 'user' && mngrSecureFirebase.$secure.userAllowed(key)){
                                    result = true;
                                }
                                else if(access !== 'public' && mngrSecureFirebase.$secure.roleAllowed(access)){
                                    result = true;
                                }
                            }
                        });
                    }
                    return result;
                },
                publicAllowed: function(){
                    return (this.type.access.indexOf('public')!==-1);
                },
                roleAllowed: function(role){
                    return (this.type.access.indexOf(role)!==-1 && angular.isObject(this.user.roles) && this.user.roles[role]);
                },
                userAllowed: function(key){
                    var result = false;
                    // user-level access can never be granted unless there is a key associated
                    if(angular.isDefined(key)){
                        // user has access if key is found in their list of entries for the type
                        // this is client-side security only.  server-side security rules must also be set up to avoid client-side spoofing
                        // when proper server-side security rules are set, any spoof attempts would return a firebase "permission denied"
                        if(angular.isObject(this.user[this.type.name]) && this.user[this.type.name][key]){
                            result = true;
                        }
                    }
                    return result;
                }
            }
        };

        // initialize security information

        // ensure type.access is always an array (for ease of use)
        if(angular.isString(type.access)){
            mngrSecureFirebase.$secure.type.access = [type.access];
        }

        // get a reference to the type's root
        mngrSecureFirebase.$secure.ref = new Firebase("https://mngr.firebaseio.com/"+type.name);

        // load the data based on user's access level
        if(mngrSecureFirebase.$secure.permit()){
            console.log('%cRoot on \''+mngrSecureFirebase.$secure.type.name+'\'...', 'background: #555; color: #F90');
            // create the $firebase object if the user has root access for this type
            mngrSecureFirebase.$secure.fire = $firebase(mngrSecureFirebase.$secure.ref);
        }
        else{
            console.log('%cRecords on \''+mngrSecureFirebase.$secure.type.name+'\'...', 'background: #000; color: #F90');
            // no root access, load what we can for the user
            mngrSecureFirebase.$secure.loadForUser();

            // ecodocs: how do we handle changes to the user's roles and data type lists

            // ecodocs: handle firebase data events in a secure way
            mngrSecureFirebase.$secure.ref.on('value', function(dataSnapshot){
                // do nothing with value, we will trigger 'value' event when one of the permitted children changes
                //console.log('%cFirebase:event: value', 'background: #999; color: #D0E');
            });
            mngrSecureFirebase.$secure.ref.on('child_added', function(childSnapshot, prevChildName){
                if(mngrSecureFirebase.$secure.permit(childSnapshot.name())){
                    console.log('%cFirebase:event: child_added:'+childSnapshot.name()+','+prevChildName, 'background: #999; color: #D0E');
                    mngrSecureFirebase.$secure.child(childSnapshot.name()).$on('loaded', function(){
                        mngrSecureFirebase.$secure.handleEvent('change');
                        mngrSecureFirebase.$secure.handleEvent('child_added', mngrSecureFirebase.$secure.snapshot(childSnapshot.name(), prevChildName));
                        if(!mngrSecureFirebase.$secure.loading){
                            mngrSecureFirebase.$secure.handleEvent('value', mngrSecureFirebase.$secure.snapshot());
                        }
                    });
                }
            });
            mngrSecureFirebase.$secure.ref.on('child_removed', function(oldChildSnapshot){
                if(mngrSecureFirebase.$secure.permit(oldChildSnapshot.name())){
                    console.log('%cFirebase:event: child_removed:'+oldChildSnapshot.name(), 'background: #999; color: #D0E');
                    mngrSecureFirebase.$secure.handleEvent('change');
                    mngrSecureFirebase.$secure.handleEvent('child_removed', mngrSecureFirebase.$secure.snapshot(oldChildSnapshot.name()));
                    if(!mngrSecureFirebase.$secure.loading){
                        mngrSecureFirebase.$secure.handleEvent('value', mngrSecureFirebase.$secure.snapshot());
                    }

                    if(mngrSecureFirebase.$secure.children[oldChildSnapshot.name()]){
                        delete mngrSecureFirebase.$secure.children[oldChildSnapshot.name()];
                    }
                }
            });
            mngrSecureFirebase.$secure.ref.on('child_changed', function(childSnapshot, prevChildName){
                if(mngrSecureFirebase.$secure.permit(childSnapshot.name())){
                    // need $timeout because the Firebase event fires before the $firebase reference gets updated
                    $timeout(function() {
                        console.log('%cFirebase:event: child_changed:'+childSnapshot.name()+':'+mngrSecureFirebase.$secure.children[childSnapshot.name()].$value+':'+(JSON.stringify(childSnapshot.val())), 'background: #999; color: #D0E');
                        mngrSecureFirebase.$secure.handleEvent('change');
                        mngrSecureFirebase.$secure.handleEvent('child_changed', mngrSecureFirebase.$secure.snapshot(childSnapshot.name(), prevChildName));
                        if (!mngrSecureFirebase.$secure.loading) {
                            mngrSecureFirebase.$secure.handleEvent('value', mngrSecureFirebase.$secure.snapshot());
                        }
                    });
                }
            });
            mngrSecureFirebase.$secure.ref.on('child_moved', function(childSnapshot, prevChildName){
                if(mngrSecureFirebase.$secure.permit(childSnapshot.name())){
                    console.log('%cFirebase:event: child_moved:'+childSnapshot.name()+','+prevChildName, 'background: #999; color: #D0E');
                    mngrSecureFirebase.$secure.handleEvent('change');
                    mngrSecureFirebase.$secure.handleEvent('child_moved', mngrSecureFirebase.$secure.snapshot(childSnapshot.name(), prevChildName));
                    if(!mngrSecureFirebase.$secure.loading){
                        mngrSecureFirebase.$secure.handleEvent('value', mngrSecureFirebase.$secure.snapshot());
                    }
                }
            });
        }

        return mngrSecureFirebase;
    }

    return function(type, user){
        return new MngrSecureFirebase(type, user);
    };
});