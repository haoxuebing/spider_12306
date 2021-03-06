const https = require('https');
const http = require('http');
const request = require('request');
const cheerio = require('cheerio');
const fs = require('fs');
const ca = fs.readFileSync('./cert/srca.cer.pem');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');
const scanf = require('scanf');
const program = require('commander');
const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36";
const inquirer = require('inquirer');
let $;
var config = {};
var prompt = inquirer.createPromptModule();
let _stations = JSON.parse(fs.readFileSync('station.json', 'utf-8'));
let isRewrite = hasArgv(process.argv, '-r');

function hasArgv(argv, filter) {
	argv = argv.slice(2);
	return argv.some((item, i) => {
		return filter;
	});
}

let questions = [
	{
		type: 'input',
		name: 'time',
		message: '输入日期-time(如:2017-01-27)：',
		validate(input) {
			let re = /[\d]{4}-[\d]{1,2}-[\d]{1,2}/ig;
			if (input.match(re)) {
				return true;
			}
			else {
				console.log(' (输入的日期非法，重新输入)');
				return false;
			}
		}
	},
	{
		type: 'input',
		name: 'from_station',
		message: '输入始发站拼音-from_station(如:shanghai)：',
		validate(input) {
			if (_stations.stationInfo[input]) {
				return true;
			}
			else {
				console.log(' (没有这个车站哦，请重新输入)');
				return false;
			}
		}
	},
	{
		type: 'input',
		name: 'end_station',
		message: '输入终点站拼音-end_station(如:hefei)：',
		validate(input) {
			if (_stations.stationInfo[input]) {
				return true;
			}
			else {
				console.log(' (没有这个车站哦，请重新输入)');
				return false;
			}
		}
	},
	{
		type: 'input',
		name: 'train_num',
		message: '输入车次-train_num(如:K1209，多个车次用|分开)：',
		validate(input) {
			return true;
		}
	},
	{
		type: 'input',
		name: 'your_mail',
		message: '输入邮箱-your_mail(如:123456789@163.com)：',
		validate(input) {
			return true;
		}
	},
	{
		type: 'password',
		name: 'mail_pass',
		message: '输入密码或者邮箱授权码-mail_pass：',
		validate(input) {
			return true;
		}
	},
	{
		type: 'confirm',
		name: 'ticket_type',
		message: '是否购买学生票?(y/n)：',
		validate(input) {
			return true;
		}
	},
	{
		type: 'input',
		name: 'receive_mail',
		message: '输入收件人邮箱(如果与上面的邮箱一致请直接回车)：',
		validate(input) {
			return true;
		}
	}
];

fs.readFile('config.json', 'utf-8', function (err, data) {
	if (err || !data || isRewrite) {
		prompt(questions).then(answer => {
			answer.from_station = _stations.stationInfo[answer.from_station];
			answer.end_station = _stations.stationInfo[answer.end_station];
			answer.train_num = answer.train_num.split('|');
			answer.ticket_type = answer.ticket_type ? '0x00' : 'ADULT';
			answer.receive_mail = answer.receive_mail || answer.your_mail;
			config = answer;
			console.log(config);
			fs.writeFile('config.json', JSON.stringify(config));
			beginGrabTicket(config);
		});
	}
	else {
		config = JSON.parse(data);
		beginGrabTicket(config);
	}
});

//开始抢票
function beginGrabTicket(config) {
	var rule = new schedule.RecurrenceRule();//这里是抢票间隔
	rule.second = [0];
	getLeftTicketUrl((data) => {
		config.leftTicketUrl = data.leftTicketUrl;
		queryTickets(config);
		schedule.scheduleJob(rule, function () {
			queryTickets(config);
		});
	});
}

function getLeftTicketUrl(callback) {
	request.get("https://kyfw.12306.cn/otn/leftTicket/init", (e, r, b) => {
		if (e) {
			callback && callback({ leftTicketUrl: 'leftTicket/queryZ' });
			console.log(e);
			return;
		}
		$ = cheerio.load(r.body, { decodeEntities: false });
		let pageHtml = $.html();
		let re = pageHtml.match(/var CLeftTicketUrl = '\w+\/\w+/ig);
		let leftTicketUrl;

		if (re && re.length) {
			leftTicketUrl = re[0].replace(/var CLeftTicketUrl = \'/, '');

			if (!leftTicketUrl) {
				leftTicketUrl = 'leftTicket/queryZ';
			}
		}
		else {
			leftTicketUrl = 'leftTicket/queryZ';
		}
		callback && callback({ leftTicketUrl: leftTicketUrl });
	});
}

var ydz_temp = [], edz_temp = [], yw_temp = [], yz_temp = [], wz_temp = [];//保存余票状态
/*
* 查询余票
*/
function queryTickets(config) {
	/*设置请求头参数*/
	let leftTicketUrl = config.leftTicketUrl;
	console.log(getTime() + '\t' + leftTicketUrl);
	var options = {
		hostname: 'kyfw.12306.cn',//12306
		port: 443,
		method: 'GET',
		path: '/otn/' + leftTicketUrl + '?leftTicketDTO.train_date=' + config.time + '&leftTicketDTO.from_station=' + config.from_station.code + '&leftTicketDTO.to_station=' + config.end_station.code + '&purpose_codes=' + config.ticket_type,
		ca: [ca],//证书
		rejectUnauthorized: false, //拒绝未经授权
		headers: {
			'Connection': 'keep-alive',
			'Host': 'kyfw.12306.cn',
			'User-Agent': UA,
			"Connection": "keep-alive",
			"Referer": "https://kyfw.12306.cn/otn/leftTicket/init",
			"Cookie": "__NRF=D2A7CA0EBB8DD82350AAB934FA35745B; JSESSIONID=0A02F03F9852081DDBFEA4AA03EF4252C569EB7AB1; _jc_save_detail=true; _jc_save_showIns=true; BIGipServerotn=1072693770.38945.0000; _jc_save_fromStation=%u77F3%u5BB6%u5E84%2CSJP; _jc_save_toStation=%u5408%u80A5%2CHFH; _jc_save_fromDate=2017-02-17; _jc_save_toDate=2017-01-19; _jc_save_wfdc_flag=dc",
		}
	};

	/*请求开始*/
	var req = https.get(options, function (res) {
		var data = '';

		res.on('data', function (buff) {
			data += buff;//查询结果（JSON格式）
		});
		res.on('end', function () {
			var jsonData;
			var trainData;
			//用来保存返回的json数据
			var trainMap;
			try {
				//这里做下处理
				console.log('data:'+data);
				var _data = JSON.parse(data);
				if(typeof _data !='object'){
					consoel.log('请求12306出错');
					return;
				}
				_data=_data.data;
				trainData = _data && _data.result;
				trainMap = _data && _data.map;
			} catch (e) {
				console.log('JSON数据出错,请检查输入配置是否正确', e);
				return;
			}
			jsonData = b4(trainData, trainMap);
			if (!jsonData || jsonData.length == 0) {
				console.log('没有查询到余票信息');
				return;
			}
			/*获取车次与车辆代码的映射表*/
			var jsonMap = {};
			for (var i = 0; i < jsonData.length; i++) {
				var cur = jsonData[i];
				jsonMap[cur.queryLeftNewDTO.station_train_code] = cur.queryLeftNewDTO;

			}
			/*过滤不需要的车次*/
			var train_arr = config.train_num;
			for (var j = 0; j < train_arr.length; j++) {
				var cur_train = jsonMap[train_arr[j]];//当前车次
				if (!cur_train) {
					console.log('当天没有' + train_arr[j] + '这趟车次');
					continue;
				}
				var ydz = cur_train.zy_num; //一等座数目
				var edz = cur_train.ze_num; //二等座数目
				var yw = cur_train.yw_num; //硬卧数目
				var yz = cur_train.yz_num; //硬座数目
				var wz = cur_train.wz_num; //站票数目

				var trainNum = cur_train.station_train_code;//车次

				if (judgeState(ydz, edz, yz, yw, wz)) {
					if (ydz_temp[j] == ydz && edz_temp[j] == edz && yw_temp[j] == yw && yz_temp[j] == yz && wz_temp[j] == wz) {//当余票状态发生改变的时候就不发送邮件
						console.log(trainNum + '车次状态没改变，不重复发邮件');
					}else{
						var ticket_info = `一等座：${ydz},\n二等座：${edz},\n硬卧：${yw},\n硬座：${yz},\n站票：${wz}`;
						console.log(`${trainNum} ${ticket_info.replace(/\n/g, '')}`);
						
						//保存当前列车的余票数量
						ydz_temp[j] = ydz;
						edz_temp[j] = edz;
						yw_temp[j] = yw;
						yz_temp[j] = yz;
						wz_temp[j] = wz;
	
						// 发邮件部分
						sendMail(trainNum, cur_train, ticket_info);
					}
				} else {
					console.log(trainNum + '暂时无票');
				}
			}
			// fs.writeFile('./train.json',data);
		});
	});

	req.on('error', function (err) {
		console.error(err.code);
	});
}

function sendMail(trainNum, cur_train, ticket_info) {

	/*设置邮箱信息*/
	var transporter = nodemailer.createTransport({
		host: "smtp.qq.com",
		secureConnection: true,
		port: 465,
		auth: {
			user: config.your_mail,//邮箱账号
			pass: config.mail_pass,//邮箱密码
		}
	});

	var mailOptions = {
		from: config.your_mail, // 发件邮箱地址
		to: config.receive_mail || config.your_mail, // 收件邮箱地址，可以和发件邮箱一样
		subject: `${trainNum}有票啦`, // 邮件标题
		text: trainNum + '有票啦\n' + cur_train.from_station_name + '=======>' + cur_train.to_station_name + '\n出发日期：' + config.time + ',\n出发时间：' + cur_train.start_time + ',\n到达时间：' + cur_train.arrive_time + ',\n历时：' + cur_train.lishi + ',\n' + ticket_info, // 邮件内容
	};

	transporter.sendMail(mailOptions, function (error, info) {
		if (error) {
			return console.log(error);
		}
		console.log(`${trainNum}有票 & 邮件已发送: =======> ${mailOptions.to}`);
	});
}

function judgeState(ydz, edz, yz, yw, wz) {
	return getState(ydz) || getState(edz) || getState(yz) || getState(yw) || getState(wz);
}

function getState(val) {
	return val != '无' && val != '--';
}

//爬取全国车站信息并生成JSON文件
function stationJson() {
	let _opt = {
		hostname: 'kyfw.12306.cn',
		path: '/otn/resources/js/framework/station_name.js?station_version=1.9042',
		ca: [ca],
		rejectUnauthorized: false
	};
	let _data = '';
	let _req = https.get(_opt, function (res) {
		res.on('data', function (buff) {
			_data += buff;
		});
		res.on('end', function () {
			// console.log(_data);
			try {
				let re = /\|[\u4e00-\u9fa5]+\|[A-Z]{3}\|\w+\|\w+\|\w+@\w+/g;
				// console.log('data',_data.match(re));
				let stationMap = {};
				let stationArray = [];
				let temp = _data.match(re);
				[].forEach.call(temp, function (item, i) {
					// console.log(item,i);
					let t = item.split("|");
					let info = {
						name: t[1],
						code: t[2],
						pinyin: t[3],
						suoxie: t[4],
						other: t[5]
					};
					stationArray.push(t[3]);
					if (!stationMap[t[3]]) {
						stationMap[t[3]] = info;
					}
					else {
						if (Object.prototype.toString.call(stationMap[t[3]]) === '[object Array]') {
							stationMap[t[3]] = [...stationMap[t[3]], info];
						}
						else {
							stationMap[t[3]] = [stationMap[t[3]], info];
						}
					}
				});
				// console.log(stationMap["hefei"]);
				fs.writeFile('station.json', JSON.stringify({ stationName: stationArray, stationInfo: stationMap }));
			} catch (e) {
				console.log(e);
				return null;
			}
		});
	});
	_req.on('error', function (err) {
		console.error(err.code);
	});
}

function getTime() {
	let T = new Date();
	return T.getFullYear() + '-' + (parseInt(T.getMonth()) + 1) + '-' + T.getDate() + ' ' + T.getHours() + ":" + T.getMinutes() + ":" + T.getSeconds();
}

function b4(ct, cv) {
	var cs = [];
	for (var cr = 0; cr < ct.length; cr++) {
		var cw = [];
		var cq = ct[cr].split("|");
		cw.secretHBStr = cq[36];
		cw.secretStr = cq[0];
		cw.buttonTextInfo = cq[1];
		var cu = [];
		cu.train_no = cq[2];
		cu.station_train_code = cq[3];  //车次
		cu.start_station_telecode = cq[4]; //始发站代码
		cu.end_station_telecode = cq[5]; //终点站代码
		cu.from_station_telecode = cq[6]; //出发地代码
		cu.to_station_telecode = cq[7]; //目的地代码
		cu.start_time = cq[8]; //开始时间
		cu.arrive_time = cq[9]; //到达时间 
		cu.lishi = cq[10]; //历时
		cu.canWebBuy = cq[11]; //能买吗？
		cu.yp_info = cq[12];
		cu.start_train_date = cq[13]; //乘车日期
		cu.train_seat_feature = cq[14];
		cu.location_code = cq[15];
		cu.from_station_no = cq[16]; //始站序
		cu.to_station_no = cq[17];  //到站序
		cu.is_support_card = cq[18];
		cu.controlled_train_flag = cq[19];
		cu.gg_num = cq[20] ? cq[20] : "--";
		cu.gr_num = cq[21] ? cq[21] : "--"; //高级软卧
		cu.qt_num = cq[22] ? cq[22] : "--";
		cu.rw_num = cq[23] ? cq[23] : "--"; //软卧
		cu.rz_num = cq[24] ? cq[24] : "--"; //软座
		cu.tz_num = cq[25] ? cq[25] : "--";
		cu.wz_num = cq[26] ? cq[26] : "--"; //无座
		cu.yb_num = cq[27] ? cq[27] : "--";
		cu.yw_num = cq[28] ? cq[28] : "--"; //硬卧
		cu.yz_num = cq[29] ? cq[29] : "--"; //硬座
		cu.ze_num = cq[30] ? cq[30] : "--"; //二等座
		cu.zy_num = cq[31] ? cq[31] : "--"; //一等座
		cu.swz_num = cq[32] ? cq[32] : "--"; //商务座
		cu.srrb_num = cq[33] ? cq[33] : "--"; //动卧
		cu.yp_ex = cq[34];
		cu.seat_types = cq[35];
		cu.exchange_train_flag = cq[36];
		cu.from_station_name = cv[cq[6]]; //出发地
		cu.to_station_name = cv[cq[7]];  //目的地
		cw.queryLeftNewDTO = cu;
		cs.push(cw)
	}
	return cs
}


