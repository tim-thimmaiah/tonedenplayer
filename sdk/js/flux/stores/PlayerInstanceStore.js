/**
 * Stores state for individual player instances.
 */

var _ = require('lodash');
var Fluxxor = require('fluxxor');

var events = require('../events');

var PlayerInstanceStore = Fluxxor.createStore({
    initialize: function() {
        this.instances = {};

        this.bindActions(
            events.player.audioInterface.TRACK_ERROR, this.onTrackError,
            events.player.audioInterface.TRACK_FINISHED, this.onTrackFinished,
            events.player.audioInterface.TRACK_PLAY_START, this.onTrackPlayStart,
            events.player.audioInterface.TRACK_READY, this.onTrackReady,
            events.player.audioInterface.TRACK_RESOLVED, this.onTrackResolved,
            events.player.CONFIG_UPDATED, this.onConfigUpdated,
            events.player.CREATE, this.onPlayerCreate,
            events.player.DESTROY, this.onPlayerDestroy,
            events.player.track.SELECTED, this.onTrackSelected
        );
    },
    getStateByID: function(id) {
        var TrackStore = this.flux.store('TrackStore');
        var instance = this.instances[id];
        var state;

        if(instance) {
            state = instance;
        } else {
            state = {
                loading: true
            };
        }

        return _.clone(state);
    },
    getNextTrackForInstance: function(playerID, TrackQueueStore) {
        var instance = this.instances[playerID];
        var nowPlayingIndex = instance.tracks.indexOf(instance.nowPlaying);
        var nextTrack;

        if(instance.repeat) {
            nextTrack = instance.nowPlaying;
        } else if(instance.playFromQueue) {
            nextTrack = TrackQueueStore.queue[0];
        } else if(instance.tracks[nowPlayingIndex + 1]) {
            nextTrack = instance.tracks[nowPlayingIndex + 1];
        } else {
            nextTrack = null;
        }

        return nextTrack;
    },
    onConfigUpdated: function(payload) {
        _.forIn(this.instances, function(player) {
            _.merge(player, payload.config);
        });

        this.emit('change');
    },
    onPlayerCreate: function(payload) {
        _.merge(this.instances, payload.entities.players);
        this.emit('change');
    },
    onPlayerDestroy: function(payload) {
        var instance = this.instances[payload.playerID];
        this.waitFor(['TrackStore'], function(TrackStore) {
            var nowPlaying = instance && TrackStore.tracks[instance.nowPlaying];
            var isPlayingInOtherPlayer = false;

            _.forIn(this.instances, function(player) {
                if(player.nowPlaying === nowPlaying) {
                    isPlayingInOtherPlayer = true;
                }
            });

            // Kind of anti-fluxy here.
            if(nowPlaying && nowPlaying.sound && !isPlayingInOtherPlayer) {
                //nowPlaying.sound.destroy();
            }

            delete this.instances[payload.playerID];
            this.emit('change');
        });
    },
    onTrackError: function(payload) {
        this.waitFor(['TrackStore'], function() {
            this.emit('change');
        });
    },
    onTrackFinished: function(payload) {
        var trackID = payload.trackID;
        var onTrackFinishedCalled;

        this.waitFor(['TrackStore', 'TrackQueueStore'], function(TrackStore, TrackQueueStore) {
            _.forIn(this.instances, function(player, playerID) {
                if(player.nowPlaying === trackID) {
                    player.nextTrack = this.getNextTrackForInstance(playerID, TrackQueueStore);
                }
            }.bind(this));

            this.emit('change');
        }.bind(this));
    },
    onTrackPlayStart: function(payload) {
        var trackID = payload.trackID;

        _.forIn(this.instances, function(player) {
            if(player.global) {
                player.nowPlaying = trackID;
            }
        });

        this.emit('change');
    },
    onTrackReady: function(payload) {
        /*var trackID = payload.trackID;

        this.waitFor(['TrackStore'], function(TrackStore) {
            _.forIn(this.instances, function(player) {
                if(player.tracks.indexOf(trackID) !== -1 && player.onTrackReady) {
                    player.onTrackReady(TrackStore.tracks[payload.trackID]);
                }
            });
        }.bind(this));*/
    },
    onTrackResolved: function(payload) {
        var originalTrackID = payload.trackID;

        // Go through each player and replace the original track with the new array of tracks.
        _.forIn(this.instances, function(player) {
            var originalTrackIndex = player.tracks.indexOf(originalTrackID);
            if(originalTrackIndex !== -1) {
                var spliceArgs = [originalTrackIndex, 1].concat(payload.result);
                Array.prototype.splice.apply(player.tracks, spliceArgs);

                if(player.nowPlaying === originalTrackID) {
                    player.nowPlaying = payload.result[0];
                }
            }
        });

        this.waitFor(['TrackStore'], function() {
            this.emit('change');
        });
    },
    onTrackSelected: function(payload) {
        _.forIn(this.instances, function(player) {
            if(player.tracks.indexOf(payload.result) !== -1 || player.global) {
                player.nowPlaying = payload.result;
            }

            delete player.nextTrack;
        });

        this.emit('change');
    }
});

module.exports = PlayerInstanceStore;
