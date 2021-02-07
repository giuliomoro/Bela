import * as express from 'express';
import * as http from 'http';
import * as multer from 'multer'
import * as child_process from 'child_process';
import * as socket_manager from './SocketManager';
import * as file_manager from './FileManager';
import * as paths from './paths';
import * as util from './utils';
import * as routes from './RouteManager';
import * as path from 'path';
import * as fs from 'fs-extra-promise';
import * as globals from './globals';
var TerminalManager = require('./TerminalManager');
import { Terminal } from 'xterm';
var pty = require('node-pty');
var expressWs = require('express-ws');

export async function init(args : Array<any>){

	let httpPort = 80;
	// load customised "dev" settings, if available. See
	// IDE/ide-dev.js.template for details on the file content
	try {
		let ideDev = require('../ide-dev.js');
		if(ideDev) {
			console.log("ideDev: ", ideDev)
			if(ideDev.hasOwnProperty('Bela'))
				paths.set_Bela(ideDev.Bela);
			if(ideDev.hasOwnProperty('local_dev'))
				globals.set_local_dev(ideDev.local_dev);
			if(ideDev.hasOwnProperty('httpPort'))
				httpPort = ideDev.httpPort;
			if(ideDev.hasOwnProperty('verbose'))
				globals.set_verbose(ideDev.verbose);
		}
	} catch (err) {}
	let n = 0;
	while(n < args.length)
	{
		let arg = args[n];
		switch (arg) {
			case "-v":
				globals.set_verbose(1);
				break;
		}
		++n;
	}

	// ensure required folders exist
	await fs.mkdirp(paths.projects);
	console.log('starting IDE from ' + paths.Bela);

	await check_lockfile()
		.catch( (e: Error) => console.log('error checking lockfile', e) );

	// setup webserver
	const app: any = express();

	var server: http.Server = new http.Server(app);
	expressWs(app);
	setup_routes(app);
	
	var USE_BINARY = false;
	var terminals: any[] = [];
	var logs: string[] = [];
	app.post('/terminals', (req : any, res : any) => {
		console.log("HIT TERMINALS");
		const env = Object.assign({}, process.env);
		env['COLORTERM'] = 'truecolor';
		var cols = parseInt(req.query.cols),
		rows = parseInt(req.query.rows),
		term = pty.spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], {
			name: 'xterm-256color',
			cols: cols || 80,
			rows: rows || 24,
			cwd: process.platform === 'win32' ? undefined : env.PWD,
			env: env,
			encoding: USE_BINARY ? null : 'utf8'
		});
		console.log('Created terminal with PID: ' + term.pid);
		terminals[term.pid] = term;
		logs[term.pid] = '';
		term.on('data', function(data : string) {
			logs[term.pid] += data;
			console.log(data);
		});
		res.send(term.pid.toString());
		res.end();
	});

	app.post('/terminals/:pid/size', (req : any, res : any) => {
		var pid = parseInt(req.params.pid),
		cols = parseInt(req.query.cols),
		rows = parseInt(req.query.rows),
		term = terminals[pid];

		term.resize(cols, rows);
		console.log('Resized terminal ' + pid + ' to ' + cols + ' cols and ' + rows + ' rows.');
		res.end();
	});

	app.ws('/terminals/:pid', function (ws : any, req : any) {
		var term = terminals[parseInt(req.params.pid)];
		console.log('Connected to terminal ' + term.pid);
		ws.send(logs[term.pid]);

		// string message buffering
		function buffer(socket : any, timeout : any) {
			let s = '';
			let sender : any = null;
			return (data : any) => {
				s += data;
				if (!sender) {
					sender = setTimeout(() => {
						socket.send(s);
						s = '';
						sender = null;
					}, timeout);
				}
			};
		}
		// binary message buffering
		function bufferUtf8(socket : any, timeout : any) {
			let buffer : any = [];
			let sender : any = null;
			let length = 0;
			return (data : any) => {
				buffer.push(data);
				length += data.length;
				if (!sender) {
					sender = setTimeout(() => {
						socket.send(Buffer.concat(buffer, length));
						buffer = [];
						sender = null;
						length = 0;
					}, timeout);
				}
			};
		}
		const send = USE_BINARY ? bufferUtf8(ws, 5) : buffer(ws, 5);

		term.on('data', function(data : any) {
			try {
				send(data);
			} catch (ex) {
				// The WebSocket is not open, ignore
			}
		});
		ws.on('message', function(msg : any) {
			term.write(msg);
		});
		ws.on('close', function () {
			term.kill();
			console.log('Closed terminal ' + term.pid);
			// Clean things up
			delete terminals[term.pid];
			delete logs[term.pid];
		});
	});

	// start serving the IDE
	//server.listen(httpPort, () => console.log('listening on port', httpPort) );
	server = app.listen(httpPort, () => console.log('listening on port', httpPort) );
	//app.listen(httpPort);

	console.log(app);
	// initialise websocket
	socket_manager.init(server);

	TerminalManager.init();
}

let backup_file_stats: util.Backup_File_Stats = {};
export async function check_lockfile(){
	let lockfile_exists =  await file_manager.file_exists(paths.lockfile);
	if (!lockfile_exists){
		backup_file_stats.exists = false;
		return;
	}
	let file_path: string = await file_manager.read_file(paths.lockfile);
	let filename: string = path.basename(file_path);
	let project_path: string = path.dirname(file_path)+'/';
	let tmp_backup_file: string = project_path+'.'+filename+'~';
	let backup_file_exists: boolean = await file_manager.file_exists(tmp_backup_file);
	if (!backup_file_exists){
		backup_file_stats.exists = false;
		return;
	}
	let backup_filename: string = filename+'.bak';
	await file_manager.copy_file(tmp_backup_file, project_path+backup_filename);
	console.log('backup file copied to', project_path+backup_filename);
	backup_file_stats.exists = true;
	backup_file_stats.filename = filename;
	backup_file_stats.backup_filename = backup_filename;
	backup_file_stats.project = path.basename(project_path);
	await file_manager.delete_file(paths.lockfile);
}
export function get_backup_file_stats(): util.Backup_File_Stats {
	return backup_file_stats;
}

function setup_routes(app: express.Application){
	// static paths
	app.use(express.static(paths.webserver_root)); // all files in this directory are served to bela.local/
	app.use('/documentation', express.static(paths.Bela+'Documentation/html'));
	app.use('/projects', express.static(paths.Bela+'projects'));

	// ajax routes

  var storage = multer.diskStorage({
    destination: paths.uploads,
    filename: function (req, file, callback) {
      callback(null, file.originalname);
      console.log('file is', file);
    }
  });

  app.post('/uploads', function(req, res) {
      var upload = multer({ storage : storage}).single('data');
      upload(req, res, function(err) {
        if(err) {
            return res.end("Error uploading file.");
        }
        res.end("File is uploaded");
      });
  });

	// file and project downloads
	app.get('/download', routes.download);
	// doxygen xml
	app.get('/documentation_xml', routes.doxygen);
	// examples
	app.use('/examples', express.static(paths.examples));
  // libs
	app.use('/libraries', express.static(paths.libraries));
	// gui
	app.use('/gui', express.static(paths.gui));
}

export function get_xenomai_version(): Promise<string>{
	if(globals.local_dev)
		return new Promise((resolve) => resolve("3.0"));
	return new Promise(function(resolve, reject){
		child_process.exec('/usr/xenomai/bin/xeno-config --version', (err, stdout, stderr) => {
			if (err){
				console.log('error reading xenomai version');
			}
			if (stdout.includes('2.6')){
				paths.set_xenomai_stat('/proc/xenomai/stat');
			} else if (stdout.includes('3.0')){
				paths.set_xenomai_stat('/proc/xenomai/sched/stat');
			}
			resolve(stdout);
		});
	});
}

export function set_time(time: string){
	if(globals.local_dev)
		return;
	child_process.exec('date -s "'+time+'"', (err, stdout, stderr) => {
		if (err || stderr){
			console.log('error setting time', err, stderr);
		} else {
			console.log('time set to:', stdout);
		}
	});
}

export function shutdown(){
	child_process.exec('shutdown -h now', (err, stdout, stderr) => console.log('shutting down', err, stdout, stderr) );
}

export async function board_detect(): Promise<any>{
	if(globals.local_dev)
		return 'unknown';
	return new Promise( (resolve, reject) => {
		child_process.exec('board_detect', (err, stdout, stderr) => {
			if (err) stdout = 'unknown';
			console.log('running on', stdout);
			resolve(stdout);
		});
	});
}

process.on('warning', e => console.warn(e.stack));
/*process.on('uncaughtException', err => {
	console.log('uncaught exception');
	throw err;
});
process.on('SIGTERM', () => {
	console.log('SIGTERM');
	throw new Error('SIGTERM');
});*/
