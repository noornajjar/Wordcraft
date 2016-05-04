// Client-side code
/* jshint browser: true, jquery: true, curly: true, eqeqeq: true, forin: true,
immed: true, indent: 4, latedef: true, newcap: true, nonew: true, quotmark: double,
undef: true, unused: true, strict: true, trailing: true */
/* global console: true, io: true, ko: true, _: true */
var main = function () {
    "use strict";

    // WordCraft namespace
    var WC = {
        // Define the User Interface jQuery selector for each DOM section
        UI: {
            chatRoom: $(".chatroom-body"),
            playerList: $(".players-body"),
        },
        // Define holder for Func functions
        Controller: {},

        // Define holder for KO View Model
        Model: {}
    };

    // Socket IO information
    var client,
        connected = false;

    // Define a function to create a single KO Player Model
    WC.Model.Player = function (player) {
        // The client.id does not contain the prefix /# like the one from
        // the server replied
        // console.log("Client id:" + "/#" + client.id);
        // console.log("Player id:" + player.id);
        return {
            name: player.name,
            id: player.id,
            self: ("/#" + client.id === player.id) ? true: false,
        };
    };

    // Define a GameRoom Model that contain an array of observable Players
    WC.Model.GameRoom = {
        // We track a list of players
        players: ko.observableArray(),

        // When we need to add a new player into the room
        // player is an object of name, id
        add: function (player) {
            var self = this;
            self.players.push(WC.Model.Player(player));
        },
        // Function to update the Game Room with a list of players
        update: function (players) {
            var self = this;
            // Compute to get only new players the server sent
            var diff = _.differenceBy(players, self.players(), "id");
            // Loop through the players to to the Player Join list
            _.each(diff, function(player) {
                self.add(player);
            });
        },
        // When we need to delete/remove a player from the room
        // when the player quit the game
        remove: function (player) {
            var self = this;
            self.players.remove(function (p) {
                return p.id === player.id;
            });
        }
    };

    // Define a function to model a chat message
    WC.Model.Message = function (msg) {
        return {
            type: msg.type + "-msg",
            message: msg.from + " " + msg.to + ": " + msg.msg,
        };
    };

    // Define a ChatRoom Model that contain an array of observable messages
    WC.Model.ChatRoom = {
        msgInput: ko.observable(),
        messages: ko.observableArray(),

        // Function to add a message into the messages array
        add: function (msg) {
            var self = this;
            self.messages.push(WC.Model.Message(msg));
        },

        // Send chat method
        send: function () {
            var self = this;
            if (self.msgInput() !== "") {
                var chatPayload = {};
                var cmd = self.msgInput().split(" ");

                // Determine if chat is of type Whisper
                if (cmd[0].toUpperCase() === "/W") {
                    // Check if sending to a valid player
                    var toPlayer = _.find(WC.Model.GameRoom.players(), function (player) {
                        return (player.name.toLowerCase() === cmd[1].toLowerCase());
                    });

                    if (toPlayer && cmd[1].toLowerCase() !== client.name.toLowerCase()) {
                        // A valid whisper
                        var msgPos = cmd[0].length + cmd[1].length + 2;
                        chatPayload.type = "private";
                        chatPayload.from = client.name;
                        chatPayload.to = toPlayer;
                        chatPayload.msg = self.msgInput().slice(msgPos);
                    } else {
                        console.log("Invalid whisper message.");
                        // TODO: Need to put a message into chat window to show
                        // the invalid whisper
                        self.msgInput("");
                        return;
                    }
                } else if (cmd[0].toUpperCase() === "/READY") {
                    // Player send game command ready to server
                    chatPayload.type = "game";
                    chatPayload.from = "Game: " + client.name;
                    chatPayload.to = "";
                    chatPayload.msg = "is ready";

                } else {
                    // Normal public chat
                    chatPayload.type = "public";
                    chatPayload.from = client.name;
                    chatPayload.to = "";
                    chatPayload.msg = self.msgInput();
                }

                // Reset the input box
                self.msgInput("");

                // Send the chat message
                if (chatPayload.type !== "game") {
                    client.emit("send message", chatPayload);
                } else {
                    client.emit("ready", chatPayload);
                }

                // Self add the chat message.  Basically need to convert the
                // message into the payload the server send
                if (chatPayload.type === "private") {
                    chatPayload.from = "Whisper to " + chatPayload.to.name;
                    chatPayload.to = "";
                } else if (chatPayload.type === "public") {
                    chatPayload.from = "Self";
                }

                // Tell Controller to display the message
                WC.Controller.displayMessage(chatPayload);
            }
            return false;
        },

        // Send chat method when enter key is pressed
        onEnterKey: function (data, event) {
            var self = this;
            if (event.keyCode === 13) {
                self.send();
                return false;
            }
            return true;
        },
        // option to clear the chat room windows
        clear: function () {
            var self = this;
            self.messages([]);
        }
    };

    // Define a model for the countDown timer
    WC.Model.CountDown = {
        display: ko.observable(false),
        value: ko.observable(),
    };

    // Define two KO computable to show the tenth and the digit
    WC.Model.CountDown.tenth = ko.computed(function () {
        var self = this;
        var tenth = Math.floor(self.value() / 10);
        return ("number-lg wc-lg-" + tenth);
    }, WC.Model.CountDown);

    WC.Model.CountDown.digit = ko.computed(function () {
        var self = this;
        var digit = self.value() % 10;
        return ("number-lg wc-lg-" + digit);
    }, WC.Model.CountDown);

    // Define a model for the Game Timer
    WC.Model.GameTimer = {
        display: ko.observable(false),
        value: ko.observable(),
    };
    // Define two KO computable to show the tenth and the digit
    WC.Model.GameTimer.tenth = ko.computed(function () {
        var self = this;
        var tenth = Math.floor(self.value() / 10);
        return ("number-sm wc-sm-" + tenth);
    }, WC.Model.GameTimer);

    WC.Model.GameTimer.digit = ko.computed(function () {
        var self = this;
        var digit = self.value() % 10;
        return ("number-sm wc-sm-" + digit);
    }, WC.Model.GameTimer);

    // Define a model for the Game Timer
    WC.Model.GameLetters = {
        display: ko.observable(false),
        letters: ko.observableArray(),
    };

    // Function to greet the server request to join
    WC.Controller.greetServer = function () {
        // Flip the flag to true
        connected = true;
        console.log("Client connected to server");
        console.dir(client);
        client.name = "player" + Date.now();

        // Greet the server to join the server
        var newPayload = {
            type: "greeting",
            from: client.name,
            msg: "Hello"
        };
        client.emit("hello", newPayload);

        // Add self so that it show up as first player on the list
        WC.Model.GameRoom.add({name: client.name, id: "/#" + client.id});
    };

    // Function to display the chat message (need to convert to KO)
    WC.Controller.displayMessage = function (data) {
        var $chatWindow = WC.UI.chatRoom;
        WC.Model.ChatRoom.add(data);
        // Auto scroll the Chat DIV to the bottom
        $chatWindow.scrollTop($chatWindow.get(0).scrollHeight);
    };

    // Function to handle player join a game
    // When a Player Join, need to update the Player List
    WC.Controller.playerJoined = function (data) {
        // Tell Model to update itself with the list of players
        WC.Model.GameRoom.update(data.players);
    };

    // Function to handle when a player leave the game
    // Need to update the Player List to remove player.
    // Payload for players should be a single player that left the game
    WC.Controller.playerLeft = function (data) {
        // Remove the player from playerList
        _.each(data.players, function(player) {
            WC.Model.GameRoom.remove(player);
        });
    };

    // Function to display the countdown timer received from the server
    // Data payload is: {"timer": number}
    WC.Controller.displayCountDown = function (data) {
        if (data.timer > 0) {
            WC.Model.CountDown.display(true);
        } else {
            WC.Model.CountDown.display(false);
        }
        WC.Model.CountDown.value(data.timer);

        console.log("displayCountDown: ");
        console.dir(data);
    };

    // Function to display the game timer received from the server
    // Data payload is: {"timer": number}
    WC.Controller.displayGameTimer = function (data) {
        if (data.timer > 0) {
            WC.Model.GameTimer.display(true);
        } else {
            WC.Model.GameTimer.display(false);
            WC.Model.GameLetters.display(false);
        }
        WC.Model.GameTimer.value(data.timer);

        console.log("displayGameTimer:");
        console.dir(data);
    };

    // Function to display the game letters received from the server
    // Data payload is: {"letters": array of letters}
    WC.Controller.displayGameLetters = function (data) {
        // Allow game letters to display
        WC.Model.GameLetters.display(true);

        // Clear the list of letters
        WC.Model.GameLetters.letters([]);

        // Format the letter into a CSS class for the Letter Sprite
        _.each(data.letters, function (letter) {
            var letterObj = {
                letter: "letter-lg wc-lg-" + letter.toUpperCase(),
            };
            WC.Model.GameLetters.letters.push(letterObj);
        });

        console.log("displayGameLetters:");
        console.dir(data);
    };

    // Function to gather the player list of words and send it to the server
    // to compute the result and final score
    WC.Controller.sendListWordsToServer = function () {
        // TODO: Code to get the list of valid words generated by the player
        // and emit it to a client
        var data = [];
        client.emit("game result", data);
    };

    // Function to display the game scores received from the game result event
    // from server.
    WC.Controller.displayGameScores = function (payload) {
        // TODO: Code to display game scores from payload
        // Payload is an array of player objects in the form of:
        // {name, score, wordListArray}
        // Score are shorted with highest to lowest
        console.log("Server game result payload", payload);
    };

    // Function to display message that game in progress and user need to join
    // later
    WC.Controller.handleGameInProgress = function () {
        // TODO: Code to handle display message/dialog to user

    };

    // Function to initialize IO connection and setup
    WC.Controller.initIO = function () {
        // Initiate SocketIO connection with server
        client = io();

        // Initialize whether the client connected
        client.on("connect", WC.Controller.greetServer);

        // Handle disconnect event when the server disconnect the client
        client.on("disconnect", function () {
            connected = false;
            console.log("Client disconnected");
            // Close the connection to prevent continous retry of connection
            client.close();
        });

        // Common events that will use Display Message which is to write to
        // chat windows only
        // Server greeting, player join game, player leave game, send chat
        var events = ["hello", "join game", "leave game", "send message", "ready"];
        _.each(events, function (event) {
            client.on(event, WC.Controller.displayMessage);
        });

        // Handle event to update the Player List when player joined
        client.on("player joined", WC.Controller.playerJoined);

        // Handle event to update the Player List when player left
        client.on("player left", WC.Controller.playerLeft);

        // Handle event to display the countdown when everyone said ready
        client.on("countdown", WC.Controller.displayCountDown);

        // Handle event to display the game timer when game started
        client.on("game timer", WC.Controller.displayGameTimer);

        // Handle event to display the game letters when game started
        client.on("game letters", WC.Controller.displayGameLetters);

        // Handle event to send player list to to the server.
        client.on("game timeup", WC.Controller.sendListWordsToServer);

        // Handle event when game is in progress to display message to newPlayer
        // that game is in progress and cannot join the game
        client.on("game in progress", WC.Controller.handleGameInProgress);

        // Handle event game result to display the final score of all player
        client.on("game result", WC.Controller.displayGameScores);

    };

    // Apply KnockOut binding
    ko.applyBindings(WC.Model);

    // Initialize Socket IO Connection and events handling
    WC.Controller.initIO();


};

$(document).ready(main);
