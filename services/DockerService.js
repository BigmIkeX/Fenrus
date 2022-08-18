const Settings = require('../models/Settings');
const docker = require('dockerode');

class DockerService 
{
    socket;
    docker;
    app;

    constructor(socket, app, system)
    {
        this.socket = socket;
        this.app = app;
        let dockerInstance = system.Docker?.filter(x => x.Uid === app.DockerUid);
        if(dockerInstance?.length)
            dockerInstance = dockerInstance[0];
        if(dockerInstance?.Address){
            this.docker = new docker({
                host: dockerInstance.Address,
                port: dockerInstance.Port || 2375
            });
        }
        else {            
            this.docker = new docker();
        }
    }

    async getContainer(name) {
        return await new Promise((resolve, reject) => {
            name = name.toLowerCase();
            this.docker.listContainers({all: true}, (err, containers) => {
                if(err)
                    console.error('err', err);
                for(let i=0; i < containers?.length; i++) {
                    let c = containers[i];
                    for(let j=0;j<c.Names?.length; j++){
                        let cName = c.Names[j].toLowerCase();
                        if(cName.startsWith('/'))
                            cName = cName.substring(1);
                        console.log(`### comparing container name '${cName}' to '${name}'`);
                        if(cName === name){
                            resolve(c);
                            return;
                        }
                    }
                }
                console.log('### failed to locate any matching containers');
                resolve(null);
            });
        });
    }

    async init()
    {
        const containerByName = await this.getContainer(this.app.DockerContainer);        
        if(!containerByName){
            console.log('##### failed to locate container by name: ', this.app.DockerContainer);
            return;
        }
        const container = this.docker.getContainer(containerByName.Id);
        if(!container){
            console.log('##### failed to locate container: ', this.app.DockerContainer, container);
            return;
        }
        
        console.log('##### actual container', container);
        let cmd = {
            'AttachStdout': true,
            'AttachStderr': true,
            'AttachStdin': true,
            'Tty': true,
            Cmd: [this.app.DockerCommand || '/bin/sh']
        };
        this.socket.on('resize', (data) => {
            container.resize({h: data.rows, w: data.cols}, () => {
            });
        });
        container.exec(cmd, (err, exec) => {
            let options = {
                'Tty': true,
                stream: true,
                stdin: true,
                stdout: true,
                stderr: true,
                // fix vim
                hijack: true,
            };

            container.wait((err, data) => {
                this.socket.emit('end', 'ended');
            });

            if (err) {
                console.log('### this.docker err: ', err);
                return;
            }

            exec.start(options, (err, stream) => {
                stream.on('data', (chunk) => {
                    let data = chunk.toString();
                    console.log('### stream.data', data);
                    this.socket.emit('data', data);
                });

                this.socket.on('data', (data) => {
                    if (typeof data !== 'object')
                        stream.write(data);
                });
            });
        });
    }
}

module.exports = DockerService;
