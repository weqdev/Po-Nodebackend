const https = require("https"),
  fs = require("fs");

const options = {
  key: fs.readFileSync("/etc/letsencrypt/live/eve-89.com/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/eve-89.com/fullchain.pem")
};
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const router = express.Router();
const app = express();
const firebase = require('firebase-admin');
const md5 = require('md5');
const firebaseServiceAccount = require('./poker_config_firebase.json');
let Mysqli = require('mysqli')

app.use(session({secret: 'ssshhhhh_poker',saveUninitialized: true, resave: true}));
app.use(bodyParser.json());      
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(__dirname + '/views'));

firebase.initializeApp({
    credential: firebase.credential.cert(firebaseServiceAccount),
    databaseURL: 'https://poker-9bf5c.firebaseio.com'
});

// let conn = new Mysqli({
//     host: 'localhost', // IP/域名
//     post: 3306, //端口， 默认 3306
//     user: 'pokeradmin', //用户名
//     passwd: 'my_password123!', //密码
//     charset: 'utf8', // 数据库编码，默认 utf8 【可选】
//     db: 'poker' // 可指定数据库，也可以不指定 【可选】
//   });

var mysql      = require('mysql');
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'pokeradmin',
  password : 'my_password123!',
  database : 'poker'
});

connection.connect();

//-----------Main Page (Web)-----------------------------------------------------------------------------------------------------------------------

router.get('/',(req, res) => {    
    if(req.session.email) {
        return res.redirect('/admin');
    }
    res.sendFile('index.html');
});

//----------- Login User API    -----------------------------------------------------------------------------------------------------------------------
const username_check = function(username) {
    return !(/\s/g.test(username) || /[ `!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/.test(username));
};

router.post('/login',(req, res) => {
    if (!username_check(req.body['username'].trim())) {
        res.json({success: false, data: "유저아이디를 확인하세요. 특수기호가 포함되어 있습니다."});
        return;
    }
    
    let user = firebase.database().ref("users/" + req.body['username']);
    user.once('value').then((snapshot) => {
        if (!snapshot || !snapshot.val()) {
            res.json({success: false, data: "유저아이디를 확인하세요. 회원가입하지 않은 유저입니다."});
            return;
        }
        
        const value = snapshot.val();
        var lastLoginDate = value['last_login'] || 0;
        var logged_in_flag = 0;
        if (lastLoginDate > new Date().getTime() - 1000 * 20)
            logged_in_flag = 1;
        if (!logged_in_flag && value['password'] && value['password'] === md5(req.body['password'])) {
            req.session.logged_in = true;
            req.session.username = snapshot.key;
            let rand = parseInt(Math.random() * 100000, 10);
            if (value['server_flag']) rand = 1979; //If Server Account, the detail_info should be 1976
            else if (rand == 1979) rand = 1982; // Otherwise, it should be random
            if (value['verified'] || 0) {
                user.update({last_login: new Date().getTime()});
                res.json({
                    success: true, 
                    data: {
                        username: snapshot.key,
                        coins: value['coins'] || 0,
                        level: value['level'] || 0,
                        money: value['money'] || 0,
                        wins: value['wins'] || 0,
                        draws:  value['draws'] || 0,
                        loses: value['loses'] || 0,
                        bank_info: value['bank_info'] || "",
                        id_code: rand,
                        photo: value['photo'] || "",
                        full_name: value['full_name'] || "",
                        detail: value['verified'],
                        created_at: value['created_at'] || "",
                        address: value['address'] || "",
                        chain: value['server_flag'] || 0,
                        vconfig: "계정이 허락되지 않았으므로 기다리십시오."
                    }
                });
            } else {
                res.json({
                    success: true, 
                    data: {
                        detail: value['verified'] || 0,
                        vconfig: "계정이 허락되지 않았으므로 기다리십시오."
                    }
                });
            }
        } else {
            req.session.logged_in = false;
            if (logged_in_flag)
                res.json({success: false, data: "지금 다른 장소에서 가입한 유저입니다."});            
            else 
                res.json({success: false, data: "가입하지 않은 아이디이거나, 틀린 비밀번호입니다."});            
        }
    });
});

//------------------- Register user -----------------------------------------------------------

router.post('/register',(req, res) => {
    sess = req.session;
    if (!username_check(req.body['username'].trim())) {
        res.json({success: false, data: "유저아이디를 확인하세요. 특수기호가 포함되어 있습니다."});
        return;
    }
    if (!req.body['password']) {
        res.json({success: false, data: "비밀번호가 맞지 않습니다."});
        return;
    }
    if (req.body['password'].length < 4) {
        res.json({success: false, data: "비밀번호가 맞지 않습니다."});
        return;
    }
    
    let user = firebase.database().ref("users/" + req.body['username']);
    user.once('value').then((snapshot) => {
        if (snapshot.val()) {
            res.json({success: false, data: "유저아이디를 확인하세요. 이미 가입한 회원입니다."});
            req.session.logged_in = false;
            return;
        }        

        user.set({
            password: md5(req.body['password']),
            server_flag: false,
            coins: 0,
            money: 0,
            bank_info: "",
            score: 0,
            wins: 0,
            loses: 0,
            draws: 0,
            address: req.body['address'] || "",
            photo: "",
            full_name: req.body['full_name'] || req.body['username'].trim(),
            id_card: req.body['id_card'] || "",
            verified: 0,
            created_at: new Date().toLocaleString('ko-KR', {timeZone: "Asia/Seoul"}),
        });

        req.session.logged_in = true;
        req.session.username = req.body['username'].trim();
        res.json({success: true, data: "회원가입등록이 성공하였습니다."});
    });
});

//----------------Change Password -----------------------------------------------------

router.post('/changepassword', (req, res) => {
    if (!req.body['password']) {
        res.json({success: false, data: "비밀번호가 오류입니다."});
        return;
    }
    if (req.body['password'].length < 4) {
        res.json({success: false, data: "비밀번호가 오류입니다."});
        return;
    }
        
    if (req.session.logged_in) {
        let user = firebase.database().ref("users/" + req.session.username);
        user.once('value').then((snapshot) => {
            let value = snapshot.val();
            if (value && value['password'] && value['password'] === md5(req.body['password'])) {
                user.update({
                    password: md5(req.body['password']),
                    last_login: new Date().getTime()
                });
                res.json({success: true});
            } else {
                res.json({success: false, data: "현재의 비밀번호를 정확히 입력하세요."});
            }            
        });
    } else {
        res.json({success: false, data: '먼저 로그인을 해야 합니다.'});
    }
});

//------------- Change User Info --------------------------------------------------------

router.post('/changeinfo', (req, res) => {    
    if (req.session.logged_in) {
        let user = firebase.database().ref("users/" + req.session.username);
        user.once('value').then((snapshot) => {
            let value = snapshot.val();
            if (value && value['password'] && value['password'] === md5(req.body['password'])) {
                let updatedData = {
                    bank_info: req.body['bank_info'] || "",
                    address: req.body['address'] || "",
                    photo: req.body['photo'] || "",
                    full_name: req.body['full_name'] || req.session.username,
                    last_login: new Date().getTime(),
                };
                
                if (req.body['newp']) {
                    updatedData['password'] = md5(req.body['newp']);
                }
                if (req.body['id_card']) {
                    updatedData['id_card'] = req.body['id_card'];
                }
                user.update(updatedData);
                res.json({success: true});                
            } else {
                res.json({success: false, data: "비밀번호를 정확히 입력하세요."});
            }            
        });        
    } else {
        res.json({success: false, data: '먼저 로그인을 해야 합니다.'});
    }
});

router.post('/getkidding',(req, res) => { //Returning the coins of user
    if (req.session.logged_in) {
        let user = firebase.database().ref("users/" + req.session.username);
        user.once('value').then((snapshot) => {    
            let value = snapshot.val();        
            if (value && value['coins'] > -1) {
                let coins = Number(value['coins']) || 0;
                res.json({success: true, data: {kiddingcount: (coins * 10324 + 1)}});
            } else {
                res.json({success: false, kiddingcount: "shit!"});
            }
        });        
    } else {
        res.json({success: false, data: '먼저 로그인을 해야 합니다.'});
    }
});


router.post('/perfectmake',(req, res) => { //Decreasing the coins when put my card
    if (Number(req.body.pros) > 0) { /* OK */ }
    else {
        res.json({success: false, data: 'Sorry! your account requires the review.'});
        return;
    }

    if (req.session.logged_in) {
        let user = firebase.database().ref("users/" + req.session.username);
        user.once('value').then((snapshot) => {
            let value = snapshot.val();
            if (value) {
                let remainingCoins = (Number(value['coins']) || 0) - req.body.pros;
                if (remainingCoins < 0) remainingCoins = 0;
                let updatedData = {
                    coins: remainingCoins,
                    last_login: new Date().getTime()
                };
                
                user.update(updatedData);
                res.json({success: true});                
            } else {
                res.json({success: false, data: "Wow! You're hacker!"});
            }            
        });        
    } else {
        res.json({success: false, data: '먼저 로그인을 해야 합니다.'});
    }
});


router.post('/perfectake',(req, res) => { //Decreasing the coins when put my card
    if (Number(req.body.pros) > 0) { /* OK */ }
    else {
        res.json({success: false, data: 'Sorry! your account requires the review.'});
        return;
    }

    if (req.session.logged_in) {
        let user = firebase.database().ref("users/" + req.session.username);
        user.once('value').then((snapshot) => {
            let value = snapshot.val();
            if (value) {
                let remainingCoins = (req.body.pros - 192) / 109483;
                if (remainingCoins < 0) remainingCoins = 0;
                let updatedData = {
                    coins: remainingCoins,
                    last_login: new Date().getTime()
                };
                
                user.update(updatedData);
                res.json({success: true});                
            } else {
                res.json({success: false, data: "Wow! You're hacker!"});
            }            
        });        
    } else {
        res.json({success: false, data: '먼저 로그인을 해야 합니다.'});
    }
});



router.post('/d',(req, res) => { //Deposit request
    if (Number(req.body.pros) > 0) { /* OK */ }
    else {
        res.json({success: false, data: 'Sorry! your account requires the review.'});
        return;
    }

    if (req.session.logged_in) {
        let user = firebase.database().ref("users/" + req.session.username);
        user.once('value').then((snapshot) => {
            let value = snapshot.val();
            if (value) {
                let remainingCoins = value.coins - req.body.pros;

                if (remainingCoins < 0) remainingCoins = 0;
                let updatedData = {
                    coins: remainingCoins,
                    last_login: new Date().getTime()
                };
                
                user.update(updatedData);
                connection.query("insert into money(amount, `date`, user_id, type,status,deleted) values(" + req.body.pros + ",'" + new Date() + "','" + req.session.username + "', 0, 3,0)", function(err, result) {
                    if (err) {
                        res.json({success: false, data: err});
                    } else {
                        res.json({success: true});                
                    }
                });
                
            } else {
                res.json({success: false, data: "Wow! You're hacker!"});
                
            }            
        });        
    } else {
        res.json({success: false, data: '먼저 로그인을 해야 합니다.'});
    }
});

router.post('/w',(req, res) => { //Deposit request
    if (Number(req.body.pros) > 0) { /* OK */ }
    else {
        res.json({success: false, data: 'Sorry! your account requires the review.'});
        return;
    }

    if (req.session.logged_in) {
        let user = firebase.database().ref("users/" + req.session.username);
        user.once('value').then((snapshot) => {
            let value = snapshot.val();
            if (value) {
                if (Number(value.coins) < Number(req.body.pros))
                    req.body.pros = Number(value.coins);
                let remainingCoins = value.coins - req.body.pros;

                if (remainingCoins < 0) remainingCoins = 0;
                let updatedData = {
                    coins: remainingCoins,
                    last_login: new Date().getTime()
                };
                
                user.update(updatedData);
                

                connection.query("insert into money(amount, `date`, user_id, type,status,deleted) values(" + req.body.pros + ",'" + new Date() + "','" + req.session.username + "', 1, 3,0)", function(err, result) {
                    if (err) {
                        res.json({success: false, data: err});
                    } else {
                        res.json({success: true});                
                    }
                });
                
            } else {
                res.json({success: false, data: "Wow! You're hacker!"});
                
            }            
        });        
    } else {
        res.json({success: false, data: '먼저 로그인을 해야 합니다.'});
    }
});


//-------------- Log out ---------------------------------------------------------------------------
///************* API ********************* */
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if(err) {
            res.json({success: false, data: err})
        }
        res.json({success: true});
    });
})
/************** web ******************* */
router.get('/logout',(req, res) => {
    req.session.destroy((err) => {
        if(err) {
            return console.log(err);
        }
        res.redirect('/');
    });
});




//-------------------------------------------------------------------------------------------------
//-------------------------------------------------------------------------------------------------
//-------------------------------------------------------------------------------------------------


app.use('/', router);

app.listen(process.env.PORT || 50568,() => {
    console.log(`App Started on PORT ${process.env.PORT || 50568}`);
});

https.createServer(options, app).listen(50569);