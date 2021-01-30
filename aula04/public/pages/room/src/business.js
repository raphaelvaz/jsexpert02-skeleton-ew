class Business {
    constructor({ room, media, view, socketBuilder, peerBuilder }) {
        this.room = room;
        this.media = media;
        this.view = view;

        this.socketBuilder = socketBuilder
        this.peerBuilder = peerBuilder

        this.socket = {}
        this.currentStream = {}
        this.currentPeer = {}

        this.peers = new Map()
        this.usersRecording = new Map()
    }
    static initialize(deps) {
        const instance = new Business(deps);
        return instance._init();
    }

    async _init() {
        this.view.configureRecordButton(this.onRecordPressed.bind(this))
        this.view.configureLeaveButton(this.onLeavePressed.bind(this))

        this.currentStream = await this.media.getCamera();
        this.socket = this.socketBuilder
            .setOnUserConnected(this.onUserConnected())
            .setOnUserDisconnected(this.onUserDisconnected())
            .build();

        this.currentPeer = await this.peerBuilder
            .setOnError(this.onPeerError())
            .setOnConnectionOpened(this.onPeerConnectionOpened())
            .setOnCallReceived(this.onPeerCallReceived())
            .setOnPeerStreamReceived(this.onPeerStreamReceived())
            .setOnCallError(this.onPeerCallError())
            .setOnCallClose(this.onPeerCallClose())
            .build()

        this.addVideoStream(this.currentPeer.id);
    }

    addVideoStream(userId, stream = this.currentStream) {
        const recorderInstance = new Recorder(userId, stream)
        this.usersRecording.set(recorderInstance.filename, recorderInstance)
        if (this.recordingEnabled) {
            recorderInstance.startRecording()
        }

        const isCurrentId = userId === this.currentPeer.id
        this.view.renderVideo({
            userId,
            stream,
            isCurrentId,
        })
    }

    onUserConnected() {
        return userId => {
            console.log('user connected!', userId);
            this.currentPeer.call(userId, this.currentStream)
        }
    }

    onUserDisconnected() {
        return userId => {
            console.log('user disconnected!', userId);

            if (this.peers.has(userId)) {
                this.peers.get(userId).call.close()
                this.peers.delete(userId)
            }

            this.view.setParticipants(this.peers.size)
            this.stopRecording(userId)
            this.view.removeVideoElement(userId)
        }
    }
    onPeerError() {
        return error => {
            console.error('error on peer!', error)
        }
    }

    onPeerConnectionOpened() {
        return (peer) => {
            const id = peer.id
            console.log('peer!!', peer)
            this.socket.emit('join-room', this.room, id);
        }
    }

    onPeerCallReceived() {
        return call => {
            console.log('answering call', call);
            call.answer(this.currentStream)
        }
    }

    onPeerStreamReceived() {
        return (call, stream) => {
            const calledId = call.peer
            if (this.peers.has(calledId)) {
                console.log('calling twice, ignoring second call...', calledId)
                return;
            }

            this.addVideoStream(calledId, stream)
            this.peers.set(calledId, { call })
            this.view.setParticipants(this.peers.size)
        }
    }

    onPeerCallError() {
        return (call, error) => {
            console.log('an call error ocurred!', error);
            this.view.removeVideoElement(call.peer)
        }
    }

    onPeerCallClose() {
        return (call, error) => {
            console.log('call close!', call.peer);
        }
    }

    onRecordPressed(recordingEnabled) {
        this.recordingEnabled = recordingEnabled
        console.log('pressionou', recordingEnabled)

        for (const [key, value] of this.usersRecording) {
            if (this.recordingEnabled) {
                value.startRecording()
                continue;
            }

            this.stopRecording(key)
        }
    }

    //se um usuario entrar e sair da call durante uma gravação
    //precisamos parar as gravações anteriores dele
    async stopRecording(userId) {
        const usersRecording = this.usersRecording
        for (const [key, value] of usersRecording) {
            const isContextUser = key.includes(userId)
            if (!isContextUser) continue;

            const rec = value
            const isRecordingActive = rec.recordingActive
            if (!isRecordingActive) continue;

            await rec.stopRecording()
            this.playRecordings(key)
        }
    }

    playRecordings(userId) {
        const user = this.usersRecording.get(userId)
        const videosURLs = user.getAllVideoURLs()
        videosURLs.map(url => {
            this.view.renderVideo({ url, userId })
        })
    }

    onLeavePressed() {
        this.usersRecording.forEach((value, key) => value.download())
    }

}