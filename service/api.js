angular.module('mngr').factory('api',function(data, models, ui, $q, mngrSecureFirebase, md5, $window) {

	var api = {
		link: function (url) {
			$window.location='#'+url;
		},
		bind:function(type, id, scope){
//			data[type].fire.$child(id).$bind(scope, type+id);
		},
		create:function(type, model){
            var defer = $q.defer();

            var date = Date.now();
            model.created = date;
            model.updated = date;
            console.log('create '+type+': '+JSON.stringify(model));
            data[type].fire.$add(model).then(function(result){
                if(model.users){
                    // it's added, update all the associated users
                    data[type].fire.$addToUsers(result.id, model.users);
                }
                defer.resolve(result);
            }, function(error){ defer.reject(error); });
            return defer.promise;

		},
		save:function(type, id){
			var time = Date.now();
			console.log('At '+time+', saving '+type+ ': '+id);

            var child = data[type].fire.$child(id);
            if(child && child.users) {
                // if there are users in the record, compare the new user value with the one in the db
                // this is so we can adjust the user's data queues appropriately
                var dbChild = data[type].fire.$getRef().child(id);
                dbChild.once('value', function(snapshot){
                    var addUsers = null;
                    var removeUsers = null;
                    if(snapshot.val() && snapshot.val().users && child.users){
                        addUsers = {};
                        removeUsers = snapshot.val().users;
                        // anything not found in the new child.users value will stay in the removeUsers
                        // conversely, anything found in the new child.users that is not in the db value (removeUsers), will be added
                        angular.forEach(child.users, function(value, userID){
                            if(!removeUsers[userID]){
                                // not there yet, add it
                                addUsers[userID] = value;
                            }
                            else{
                                // it is there, take it out of the removal list
                                delete removeUsers[userID];
                            }
                        });
                    }

                    // save the record
                    data[type].fire.$save(id).then(function(){
                        // then update the user data queues
                        if(addUsers && Object.keys(addUsers).length){
                            data[type].fire.$addToUsers(id, addUsers);
                        }
                        if(removeUsers && Object.keys(removeUsers).length){
                            data[type].fire.$removeFromUsers(id, removeUsers);
                        }
                    });
                });
            }
            else{
                // don't need to deal with users for this record
                data[type].fire.$save(id);
            }
            // always want to save the updated time
            data[type].fire.$child(id).$update({updated: time});
		},
		set:function(type, id, model){
			//ecodocs inits an object and creates a child with provided id.
			/**var object={};
			object[id] = model;
			data[type].fire.$set(object);
             // that approach would overwrite the entire data[type] table, leaving only the id:model record
             */

            var dbChild = data[type].fire.$getRef().child(id);
            dbChild.once('value', function(snapshot){
                // if there are users in the database record or in the new model, we need to handle dataQueue syncing
                if((model && model.users) || (snapshot.val() && snapshot.val().users)){
                    var addUsers = null;
                    var removeUsers = null;
                    if(snapshot.val() && snapshot.val().users && model.users){
                        addUsers = {};
                        if(snapshot.val().users){
                            removeUsers = snapshot.val().users;
                        }
                        // anything not found in the new model.users value will stay in the removeUsers
                        // conversely, anything found in the new model.users that is not in the db value (removeUsers), will be added
                        angular.forEach(model.users, function(value, userID){
                            if(!removeUsers || !removeUsers[userID]){
                                // not in db yet, add it (no users at all, or no entry for this one)
                                addUsers[userID] = value;
                            }
                            else if(removeUsers && removeUsers[userID]){
                                // it is in db and new model, take it out of the removal list
                                delete removeUsers[userID];
                            }
                        });

                        // save the record
                        data[type].fire.$child(id).$set(model).then(function(){
                            // then update the user data queues
                            if(addUsers && Object.keys(addUsers).length){
                                data[type].fire.$addToUsers(id, addUsers);
                            }
                            if(removeUsers && Object.keys(removeUsers).length){
                                data[type].fire.$removeFromUsers(id, removeUsers);
                            }
                        });
                    }
                }
                else{
                    data[type].fire.$child(id).$set(model);
                }
            });
		},
		update:function(type, id, model){
			//ecodocs inits an object and creates a child with provided id.
			/**var object={};
			object[id] = model;
			data[type].fire.$update(object);
             // that approach would overwrite the full data[type][id] record rather than updating it
             */
			console.log('Updating '+type+': '+id+' with: '+model);

			var time = Date.now();

            if(model && model.users) {
                // if there are users in the new model, compare the new user value with the one in the db
                // this is so we can adjust the user's data queues appropriately
                var dbChild = data[type].fire.$getRef().child(id);
                dbChild.once('value', function(snapshot){
                    var addUsers = null;
                    var removeUsers = null;
                    if(snapshot.val() && snapshot.val().users && model.users){
                        addUsers = {};
                        removeUsers = snapshot.val().users;
                        // anything not found in the new model.users value will stay in the removeUsers
                        // conversely, anything found in the new model.users that is not in the db value (removeUsers), will be added
                        angular.forEach(model.users, function(value, userID){
                            if(!removeUsers[userID]){
                                // not there yet, add it
                                addUsers[userID] = value;
                            }
                            else{
                                // it is there, take it out of the removal list
                                delete removeUsers[userID];
                            }
                        });
                    }

                    // save the record
                    data[type].fire.$child(id).$update(model).then(function(){
                        // then update the user data queues
                        if(addUsers && Object.keys(addUsers).length){
                            data[type].fire.$addToUsers(id, addUsers);
                        }
                        if(removeUsers && Object.keys(removeUsers).length){
                            data[type].fire.$removeFromUsers(id, removeUsers);
                        }
                    });
                });
            }
            else{
                // don't need to deal with users for this record
                data[type].fire.$child(id).$update(model);
            }
            data[type].fire.$child(id).$update({updated: time});
		},
		remove:function(type, id){
            var defer = $q.defer();
            console.log('remove:'+type+'/'+id);
            var child = data[type].fire.$child(id);
            if(child){
                child.$on('loaded', function(){
                    var users = null;
                    // get the associated users before we remove it
                    if(child.users){
                        users = child.users;
                    }
                    data[type].fire.$remove(id).then(function(){
                        if(users){
                            // it's removed, clean up all the associated user records
                            data[type].fire.$removeFromUsers(id, users);
                        }
                        defer.resolve(true);
                    });
                });
            }
            else{
                defer.reject(type+'/'+id+' does not exist!');
            }
            return defer.promise;
		},

        loadData: function(){
            var defer = $q.defer();

            var datasLoaded = {};
            angular.forEach(data.types, function(type){
                // only load it if it is not already loaded or is not public (so we aren't reloading public sets)
                if(!data[type.name] || type.access.indexOf('public')===-1){
                    var dataLoaded = $q.defer();
                    datasLoaded[type.name] = dataLoaded.promise;

                    // clean up existing instance of this data type
                    if(data[type.name] && data[type.name].fire){
                        data[type.name].fire.destroy();
                        delete data[type.name].fire;
                    }

                    var secureFire = mngrSecureFirebase(type, data.user.profile);
                    data[type.name] = {
                        fire: secureFire,
                        array: []
                    };
                    secureFire.$on('loaded', function(){
                        dataLoaded.resolve(true);
                    });
                    // generate the array every time there is a value
                    secureFire.$on('value', function(){
                        data[type.name].array = secureFire.$asArray();
                    });
                }
            });

            $q.all(datasLoaded).then(function(results){
                defer.resolve(true);
            });

            return defer.promise;
        },

        callbackError: function(error){
            var errorMsg = '';
            if(error){
                if(error.code){
                    switch(error.code){
                        case 'EMAIL_TAKEN':
                            errorMsg = 'Email address is in use';
                            break;
                    }
                }
                else{
                    errorMsg = error;
                }
            }
            if(!errorMsg){
                errorMsg = 'Unknown error occurred';
            }
            // ecodocs: where do we put error messages?
            console.log('Error:'+errorMsg);
        },
        callbackSuccess: function(result){
            if(result){
                if(result.uid){
                    // user authenticated
                    api.loadProfile(result).then(api.callbackSuccess, api.callbackError);
                }
                else if(!result.new && result.name && result.email){
                    // user profile loaded
                    api.loadData().then(function(){
                        api.loadState();
                    });
                }
                else if(result.new && result.linked){
                    // new user profile
                    if(result.confirmed){
                        api.createProfile();
                    }
                }
                else if(result.created && result.type && result.id){
                    // new record saved
                    switch(result.type){
                        case 'users':
                            if(data.user.profile.email){
                                api.set('userEmails', md5.createHash(data.user.profile.email), result.id);
                            }
                            if(data.user.profile.linked){
                                api.linkProfileAccounts(result.id, data.user.profile.linked).then(function(){
                                    api.login('active'); // profile is created and linked, login to activate
                                });
                            }

                            break;
                        default:
                            console.log('Created:'+result.type+'/'+result.id);
                            break;
                    }
                }
            }
        },

        // logs a user in via the given provider
        login: function(provider, email, password){
            // handle login request based on provider
            switch(provider){
                case 'active':
                    api.loginActive();
                    break;

                case 'password':
                    api.loginPassword(email, password);
                    break;

                case 'facebook':
                case 'twitter':
                case 'google':
                    api.loginProvider(provider);
                    break;
            }
        },
        // logs in the active user (ie. by cookie)
        loginActive: function(){
            data.user.auth.$getCurrentUser().then(api.callbackSuccess, api.callbackError);
        },
        // logs in a user by email/password account
        loginPassword: function(email, password){
            data.user.auth.$login('password', {email:email, password:password}).then(api.callbackSuccess, api.callbackError);
        },
        // logs in a user by 3rd party provider
        loginProvider: function(provider){
            data.user.auth.$login(provider).then(api.callbackSuccess, api.callbackError);
        },

        // logs a user out
        logout: function(){
            data.user.auth.$logout();
            data.user.profile = null;
            api.loadData();
        },

        // creates a user email/password account
        createAccount: function(email, password, passwordConfirm){
            if(!email){
                api.callbackError('No email');
            }
            else if(!password){
                api.callbackError('No password');
            }
            else if(password.length < 6){
                api.callbackError('Passwords is too short');
            }
            else if(passwordConfirm !== password){
                api.callbackError('Passwords don\'t match');
            }
            else{
                api.userEmailAvailable(email).then(function(available){
                    if(available){
                        data.user.auth.$createUser(email, password).then(api.callbackSuccess, api.callbackError);
                    }
                    else{
                        api.callbackError({code: "EMAIL_TAKEN"});
                    }
                });
            }
        },

        // removes a user email/password account
        removeAccount: function(email, password){
            if(email && password){
                console.log('removeAccount:'+email+':'+password);
                data.user.auth.$removeUser(email, password).then(api.callbackSuccess, api.callbackError);
            }
        },

        // recovers a user's password
        recoverPassword: function(email){
            console.log('recoverPassword:'+email);
        },

        // changes a user's password
        changePassword: function(email, oldPassword, newPassword){
            console.log('changePassword:'+email);
        },

        // creates a user profile for a given account
        createProfile: function(){
            api.userEmailAvailable(data.user.profile.email).then(function(available){
                if(available){
                    if(angular.isDefined(data.user.profile.new)){
                        delete data.user.profile.new;
                    }
                    if(angular.isDefined(data.user.profile.confirmed)){
                        delete data.user.profile.confirmed;
                    }

                    api.create('users', data.user.profile).then(api.callbackSuccess, api.callbackError);
                }
                else{
                    api.callbackError({code: "EMAIL_TAKEN"});
                }
            });
        },
        linkProfileAccounts: function(userID, accounts){
            var defer = $q.defer();
            var accountsLinked = {};
            angular.forEach(accounts, function(linked, uid){
                if(linked){
                    accountsLinked[uid] = api.set('userAccounts', uid, userID);
                }
            });
            $q.all(accountsLinked).then(function(){
                defer.resolve(true);
            });
            return defer.promise;
        },
        newProfile: function(account){
            var newProfile = null;
            if(account.uid){
                newProfile = {
                    new: true,
                    confirmed: false,   // confirmed===true when the user has confirmed their email address
                    linked: {}
                };
                newProfile.linked[account.uid] = true;

                // set email
                if(account.email){
                    newProfile.email = account.email;
                }
                else if(account.thirdPartyUserData && account.thirdPartyUserData.email){
                    newProfile.email = account.thirdPartyUserData.email;
                }

                // set name
                if(account.displayName){
                    newProfile.name = account.displayName;
                }
                else if(newProfile.email){
                    // no display name, parse it from the email
                    var emailParse = newProfile.email.match(/^(\w+)@/);
                    if(emailParse && emailParse.length > 1){
                        newProfile.name = emailParse[1];
                    }
                }

                // auto-confirm email/password accounts
                if(account.provider==='password' && newProfile.email){
                    newProfile.confirmed = true;
                }

                // set default values for all user profile fields
                angular.forEach(models['users'], function(field){
                    if(angular.isUndefined(newProfile[field.name])){
                        newProfile[field.name] = field.value;
                    }
                });
            }
            return newProfile;
        },

        // loads the user profile for a given account
        loadProfile: function(account){
            var defer = $q.defer();
            if(account.uid){
                // look up user account
                var userAccount = data['userAccounts'].fire.$child(account.uid);
                userAccount.$on('loaded', function(){
                    if(userAccount.$value){
                        // load the profile linked to the account
                        var userProfile = data['users'].fire.$child(userAccount.$value);
                        userProfile.$on('loaded', function(){
                            if(userProfile.$value===null){
                                // this would be if the account.uid is linked to a missing profile
                                data.user.profile = api.newProfile(account);
                                defer.resolve(data.user.profile);
                            }
                            else{
                                data.user.profile = userProfile;
                                defer.resolve(data.user.profile);
                            }
                        });
                    }
                    else{
                        // if no profile linked to the account, create a new profile
                        data.user.profile = api.newProfile(account);
                        defer.resolve(data.user.profile);
                    }
                });
            }
            else{
                defer.reject('No account to load uid for');
            }
            return defer.promise;
        },

        // check if the given email is associated with an existing account
        userEmailAvailable: function(email){
            var defer = $q.defer();
            var emailCheck =data['userEmails'].fire.$child(md5.createHash(email));
            emailCheck.$on('loaded', function(){
                if(emailCheck.$value===null){
                    defer.resolve(true);
                }
                else{
                    defer.resolve(false);
                }
            });
            return defer.promise;
        },

        setWorkspace: function(workspace, component, params){
            if(Object.keys(ui.workspace).indexOf(workspace)!==-1){
                // load the component into the workspace
                ui.workspace[workspace].component = component.name;

                // reset any existing parameters in this workspace
                angular.forEach(ui.workspace[workspace].params, function(value, name){
                    delete ui.workspace[workspace].params[name];
                });

                // load the parameters we are given
                if(angular.isArray(params)){
                    // for array params - load the params in the order the component defines them
                    angular.forEach(component.params, function(name, index){
                        if(index < params.length){
                            ui.workspace[workspace].params[name] = params[index];
                        }
                    });

                    // if there are more params than component is configured for, append the extra params onto the last configured param
                    if(params.length > component.params.length){
                        var lastParam = component.params[component.params.length-1];
                        ui.workspace[workspace].params[lastParam] += (ui.workspace[workspace].params[lastParam]?'/':'')+params.slice(component.params.length).join('/');
                    }
                }
                else if(angular.isObject(params)){
                    // for object params - set the params that are defined for the component
                    angular.forEach(params, function(value, name){
                        if(component.params.indexOf(name)!==-1){
                            ui.workspace[workspace].params[name] = value;
                        }
                    });
                }
            }
        },
        loadPath: function(path, workspace){
            if(Object.keys(ui.workspace).indexOf(workspace)!==-1){
                // valid workspace, load the path into the ui

                // strip off any leading or trailing /'s from path (for easier parsing)
                path = (path.charAt(0) === '/') ? path.substr(1) : path;
                path = (path.charAt(path.length - 1) === '/') ? path.substring(0, path.length - 1) : path;

                // parse the path by /'s
                var pathParts = path.split('/');
                var componentFound = false;
                if(pathParts && pathParts.length){
                    var componentName = pathParts[0];   // component name is part before first '/'
                    var params = pathParts.slice(1);    // params are everything after first '/'

                    // search for the given componentName in the configured components
                    // set it into the workspace when a match is found
                    angular.forEach(ui.components, function(component, componentIdx){
                        if(component.name===componentName){
                            api.setWorkspace(workspace, component, params);
                            componentFound = true;
                        }
                    });
                    // component not found in ui.components - search in ui.notify.components
                    if(!componentFound){
                        angular.forEach(ui.notify.components, function(component, componentIdx){
                            if(component.name===componentName){
                                api.setWorkspace(workspace, component, params);
                                componentFound = true;
                            }
                        });
                    }
                }

                // if the first part of the path is not a valid component, load the default component
                if(!componentFound){
                    angular.forEach(ui.components, function(component, componentIdx){
                        if(component.default){
                            api.setWorkspace(workspace, component, pathParts);
                            componentFound = true;
                        }
                    });
                }
                // at this point if !componentFound - then there isn't even a default component configured
            }
        },
        loadState: function (fromPath, withParams) {
            var path = angular.isDefined(fromPath) ? fromPath : ui.path;
            var params = angular.isDefined(withParams) ? withParams : ui.params;

            if(path){
                api.loadPath(path, 'main');
            }

            angular.forEach(params, function(value, workspace){
                api.loadPath(value, workspace);
            });
        }

	};

	return api;
});
