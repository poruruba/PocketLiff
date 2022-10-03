'use strict';

const HELPER_BASE = process.env.HELPER_BASE || "/opt/";
const Response = require(HELPER_BASE + 'response');
const jsonfile = require(HELPER_BASE + 'jsonfile-utils');

const USER_LIST_FNAME = process.env.THIS_BASE_PATH + "/data/pocket/users.json";

const LIFF_ID = "【LINEのLIFF ID】";
const LINE_CHANNEL_ID = "【LINEのチャネルID】";

const POCKET_CONSUME_KEY = "【PocketのConsumer Key】";
const POCKET_REDIRECT_URL = "https://liff.line.me/" + LIFF_ID + "/?cmd=PocketSignin";
const CACHE_IMAGE_WIDTH = 1024;
const CACHE_FNAME_BASE = process.env.THIS_BASE_PATH + "/public/pocket_liff/img/cache/";
const POCKET_SEARCH_COUNT = 10;
const PUBLIC_BASE_URL = "https://【Node.jsサーバのホスト名】/pocket_liff/";

const LINE_CHANNEL_ACCESS_TOKEN = "【LINEのチャネルアクセストークン(長期)】";
const LINE_CHANNEL_SECRET = "【LINEのちぇねるシークレット】";

const LineUtils = require(HELPER_BASE + 'line-utils');
const line = require('@line/bot-sdk');
const app = new LineUtils(line, {
	channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
	channelSecret: LINE_CHANNEL_SECRET
});

const LINE_RICHMEMU_ID = "【LINEのリッチメニューID】";
app.client.setDefaultRichMenu(LINE_RICHMEMU_ID);

const fs = require('fs').promises;
const fetch = require('node-fetch');
const Headers = fetch.Headers;
const sharp = require('sharp');

app.message(async (event, client) =>{
	var user_list = await jsonfile.read_json(USER_LIST_FNAME, [] );
	var user = user_list.find(item => item.line_userId == event.source.userId );
	if( !user ){
		var message = app.createSimpleResponse("まだPocketを登録していません。アプリを立ち上げて登録してください。");
		return client.replyMessage(event.replyToken, message);
	}

	var carousel_list = await createCarouselList(user.pocket_access_token, event.message.text.trim());
	console.log(carousel_list);
	var carousel = app.createCarousel('Carousel', carousel_list);

	return client.replyMessage(event.replyToken, carousel);
});

app.postback(async (event, client) =>{
	console.log(event);
	switch(event.postback.data){
		case 'menu_help' : {
			var message = app.createSimpleResponse("フィルタリングしたいキーワードを入力するか、最新リストボタンを押してください。\nまだPocketを登録していない場合は、アプリを起動してください。");
			return client.replyMessage(event.replyToken, message);
		}

		case 'menu_latest': {
			var user_list = await jsonfile.read_json(USER_LIST_FNAME, [] );
			var user = user_list.find(item => item.line_userId == event.source.userId );
			if( !user ){
				var message = app.createSimpleResponse("まだPocketを登録していません。アプリを立ち上げて登録してください。");
				return client.replyMessage(event.replyToken, message);
			}

			var message = app.createSimpleResponse("続けて表示する場合は、次へを押してください。");

			var carousel_list = await createCarouselList(user.pocket_access_token);
//			console.log(carousel_list);
			var carousel = app.createCarousel('Carousel', carousel_list);

			var list = [
				{
						title: "次へ",
						action: {
								type: "postback",
								data: "menu_latest_" + String(POCKET_SEARCH_COUNT)
						}
				},
			];
			var quickReply = app.createQuickReply(list);
			carousel.quickReply = quickReply;

			return client.replyMessage(event.replyToken, [message, carousel]);
		}

		default: {
			if( event.postback.data.startsWith("menu_latest_") ){
				var offset = parseInt(event.postback.data.substring("menu_latest_".length));

				var user_list = await jsonfile.read_json(USER_LIST_FNAME, [] );
				var user = user_list.find(item => item.line_userId == event.source.userId );
				if( !user ){
					var message = app.createSimpleResponse("まだPocketを登録していません。アプリを立ち上げて登録してください。");
					return client.replyMessage(event.replyToken, message);
				}

				var carousel_list = await createCarouselList(user.pocket_access_token, undefined, offset);
//				console.log(carousel_list);
				var carousel = app.createCarousel('Carousel', carousel_list);

				var list = [];
				if( offset >= POCKET_SEARCH_COUNT){
					list.push({
						title: "前へ",
						action: {
								type: "postback",
								data: "menu_latest_" + String(offset - POCKET_SEARCH_COUNT)
						}
					});
				}
				if( carousel_list.length > 0 ){
					list.push({
						title: "次へ",
						action: {
								type: "postback",
								data: "menu_latest_" + String(offset + POCKET_SEARCH_COUNT)
						}
					});
				}
				var quickReply = app.createQuickReply(list);
				carousel.quickReply = quickReply;

				return client.replyMessage(event.replyToken, carousel);
			}else{
				break;
			}
		}
	}
});

exports.fulfillment = app.lambda();


exports.handler = async (event, context, callback) => {
	var body = JSON.parse(event.body);
	console.log(body);

	var result = await do_post_urlencoded("https://api.line.me/oauth2/v2.1/verify", { id_token: body.id_token, client_id: LINE_CHANNEL_ID });
	console.log(result);
	var userId = result.sub;
	var displayName = result.name;
	
	if( event.path == '/pocket-signin'){
		var user_list = await jsonfile.read_json(USER_LIST_FNAME, [] );
		var user = user_list.find(item => item.line_userId == userId );
		if( !user ){
			user = {
				line_userId: userId,
				line_displayName: displayName,
			};
			user_list.push(user);
		}

		if( body.cmd == 'PocketSignin'){
			if( !user.pocket_code )
				throw new Error("invalid status");

			var result = await do_post_pocket("https://getpocket.com/v3/oauth/authorize", {
				consumer_key: POCKET_CONSUME_KEY,
				code: user.pocket_code
			});
			console.log(result);

			user.pocket_code = null;
			user.pocket_access_token = result.access_token;
			user.pocket_username = result.username;
			await jsonfile.write_json(USER_LIST_FNAME, user_list);

			return new Response({
				cmd: body.cmd,
				line_displayName: user.line_displayName,
				pocket_username: user.pocket_username
			});
		}else{
			var result = await do_post_pocket("https://getpocket.com/v3/oauth/request", {
				consumer_key: POCKET_CONSUME_KEY,
				redirect_uri: POCKET_REDIRECT_URL
			});
			console.log(result);

			user.pocket_code = result.code;
			await jsonfile.write_json(USER_LIST_FNAME, user_list);

			return new Response( {
				signin_url: "https://getpocket.com/auth/authorize?request_token=" + result.code + "&redirect_uri=" + POCKET_REDIRECT_URL,
			});
		}
	}else

	if( event.path == "/pocket-retrieve" ){
		var user_list = await jsonfile.read_json(USER_LIST_FNAME, [] );
		var user = user_list.find(item => item.line_userId == userId );
		if( !user )
			throw new Error('user not found');
		if( !user.pocket_access_token )
			throw new Error('pocket not signin');

		var params = {
			consumer_key: POCKET_CONSUME_KEY,
			access_token: user.pocket_access_token,
			sort: "newest",
			count: body.num_of_items
		};
		if( body.offset )
			params.offset = body.offset;
		if( body.search )
			params.search = body.search;
		var result = await do_post_pocket("https://getpocket.com/v3/get", params );
//		console.log(result);

		let list = Object.keys(result.list).reduce((list, item) => {
			if( !result.list[item].resolved_title ) result.list[item].resolved_title = result.list[item].given_title || "no title";
			if( !result.list[item].excerpt ) result.list[item].excerpt = "no description";
			if( !result.list[item].resolved_url ) result.list[item].resolved_url = result.list[item].given_url;
			list.push(result.list[item]);
			return list;
		}, []);
		list.sort((first, second) =>{
				let first_time = parseInt(first.time_added);
				let second_time = parseInt(second.time_added);
				if( first_time > second_time )
						return -1;
				else if( first_time == second_time )
						return 0;
				else
						return 1;
		});

		return new Response({ list: list });
	}
}

function do_post_pocket(url, body) {
  const headers = new Headers({ "Content-Type": "application/json; charset=UTF-8", "X-Accept": "application/json" });

  return fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: headers
    })
    .then((response) => {
      if (!response.ok)
        throw new Error('status is not 200');
      return response.json();
    });
}

function do_get_binary(url, qs) {
  var params = new URLSearchParams(qs);

  var params_str = params.toString();
  var postfix = (params_str == "") ? "" : ((url.indexOf('?') >= 0) ? ('&' + params_str) : ('?' + params_str));
  return fetch(url + postfix, {
      method: 'GET',
    })
    .then((response) => {
      if (!response.ok)
        throw new Error('status is not 200');
      return response.arrayBuffer();
	});
}

function do_post_urlencoded(url, params) {
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });
  var body = new URLSearchParams(params);

  return fetch(url, {
      method: 'POST',
      body: body,
      headers: headers
    })
    .then((response) => {
      if (!response.ok)
        throw new Error('status is not 200');
      return response.json();
    })
}

async function resize_image(url, id){
	try{
		var fname = CACHE_FNAME_BASE + id + ".jpg";
		if( !await fileExists(fname) ){
			var buffer = await do_get_binary(url);
			await sharp(Buffer.from(buffer))
				.resize({
					width: CACHE_IMAGE_WIDTH,
					height: CACHE_IMAGE_WIDTH,
					fit: "inside"
				})
				.jpeg()
				.toFile(fname);
		}
		return PUBLIC_BASE_URL + "img/cache/" + id + ".jpg";
	}catch(error){
//		console.log(error);
		return PUBLIC_BASE_URL + "img/default_image.png";
	}
}

async function fileExists(filepath) {
  try {
    return !!(await fs.lstat(filepath))
  } catch (e) {
    return false
  }
}

async function createCarouselList(pocket_access_token, search, offset){
	var params = {
		consumer_key: POCKET_CONSUME_KEY,
		access_token: pocket_access_token,
		sort: "newest",
		count: POCKET_SEARCH_COUNT
	};
	if( offset )
		params.offset = offset;
	if( search )
		params.search = search;
	var result = await do_post_pocket("https://getpocket.com/v3/get", params );
	console.log(result.list);
	let list = Object.keys(result.list).reduce((list, item) => {
		if( !result.list[item].resolved_title ) result.list[item].resolved_title = result.list[item].given_title || "no title";
		if( !result.list[item].excerpt ) result.list[item].excerpt = "no description";
		if( !result.list[item].resolved_url ) result.list[item].resolved_url = result.list[item].given_url;
		list.push(result.list[item]);
		return list;
	}, []);
	list.sort((first, second) =>{
		let first_time = parseInt(first.time_added);
		let second_time = parseInt(second.time_added);
		if( first_time > second_time )
			return -1;
		else if( first_time == second_time )
			return 0;
		else
			return 1;
	});

	var carousel_list = [];
	for( const item of list ){
		var image_url = await resize_image(item.top_image_url, item.item_id);
		var obj = {
			title: item.resolved_title,
			desc: item.excerpt,
			image_url: image_url,
			action_text: "ブラウザ起動",
			action: {
				type: "uri",
				uri: item.resolved_url 
			}
		};
		carousel_list.push(obj);
	}

	return carousel_list;
}