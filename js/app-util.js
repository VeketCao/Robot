/**
 * Created by admin on 2015/12/26.
 */
var __initUtil=function(app){

    /**查询xrp**/
    app.accountInfo=function(address, callback) {
        var request = app.remote.requestAccountInfo({account: address})
            .on('success', function(data){ callback(null, data);})
            .on('error', function(e){ callback(e, null); });
        request.timeout(ROBOT.REQUEST.timeout, function(){ callback('timeout', null);});

        try { request.request(); } catch (e) { callback(e, null); }
    };

    /**查询其它货币**/
    app.accountLines=function(address, callback){
        var request = app.remote.requestAccountLines({account: address})
            .on('success', function(data){ callback(null, data);})
            .on('error', function(e){ callback(e, null); });
        request.timeout(ROBOT.REQUEST.timeout, function(){ callback('timeout', null);});

        try { request.request(); } catch (e) { callback(e, null);}
    }

    /**查询委托单**/
    app.accountOffers=function(address, callback){
        var request = app.remote.requestAccountOffers({account: address})
            .on('success', function(data){ callback(null, data);})
            .on('error', function(e){ callback(e, null); });
        request.timeout(ROBOT.REQUEST.timeout, function(){ callback('timeout', null);});

        try { request.request(); } catch (e) { callback(e, null);}
    };

    /**解析Offers**/
    app.parseOffers=function(data, callback) {
        var offers = {};
        data.offers.forEach(function(offerData) {
            var order = {};
            var gets = ripple.Amount.from_json(offerData.taker_gets);
            var pays = ripple.Amount.from_json(offerData.taker_pays);

            order.type = (offerData.flags === 0) ? 'buy' : 'sell';
            order.gets_currency = gets.currency().to_human();
            order.gets_issuer   = gets.issuer().to_json();
            order.gets_value    = (order.gets_currency == 'XRP') ? gets.to_number()/1000000 : gets.to_number();
            order.pays_currency = pays.currency().to_human();
            order.pays_issuer   = pays.issuer().to_json();
            order.pays_value = (order.pays_currency == 'XRP') ? pays.to_number()/1000000 : pays.to_number();
            order.price = (order.type == 'buy') ? order.gets_value/order.pays_value : order.pays_value / order.gets_value;
            order.seq = offerData.seq;

            offers[order.seq] = order;
        });

        callback(null, offers);
    };

    /**创建Amount对象**/
    app.createAmount=function(value, curr, issuer) {
        var amt = ripple.Amount.from_human(value + curr);
        amt.set_issuer(issuer);
        return amt;
    }

    /**创建委托单**/
    app.createOffer=function(address, type, buy_amount, sell_amount, callback) {
        var transaction = app.remote.transaction();

        transaction.offerCreate({
            from : address,
            buy  : buy_amount,
            sell : sell_amount
        });

        if (type === 'sell') {
            transaction.setFlags('Sell');
        };

        transaction.on('proposed', function(res) {
            app.info('Offer proposed.' + res.tx_json.Sequence);
        });

        transaction.on('success', function(res) {
            app.info('Offer success.' + res.tx_json.Sequence);
            callback(null, res.tx_json.Sequence);
        });

        transaction.on('error', function(res) {
            console.error('Offer error. ');
            console.error(JSON.stringify(res));
            callback('CreateOfferErr', 0);
        });

        var buy_currency = buy_amount.currency().to_human();
        var buy_value = (buy_currency == 'XRP') ? buy_amount.to_number()/1000000 : buy_amount.to_number();
        var sell_currency = sell_amount.currency().to_human();
        var sell_value = (sell_currency == 'XRP') ? sell_amount.to_number()/1000000 : sell_amount.to_number();
        var price = (type == 'buy') ? sell_value / buy_value : buy_value / sell_value;

        app.info('Create offer: ' + type + ' ' + buy_value + buy_currency + ' ' + sell_value + sell_currency + ' Price: ' + price);

        try {
            transaction.submit();
        } catch (e) {
            console.error('Offer submit error. ', e);
            callback('CreateOfferErr', 0);
        }
    }

    /**取消委托单**/
    app.cancelOffer=function(address, seq, callback) {
        var transaction = app.remote.transaction();
        transaction.offerCancel(address, seq);

        transaction.on('success', function(res) {
            app.info('Cancel offer success. ' + seq);
            callback(null)
        });
        transaction.on('error', function(res) {
            console.error('Cancel offer error. ' + seq);
            console.error(JSON.stringify(res));
            callback('CancelErr');
        });

        try {
            transaction.submit();
        } catch (e) {
            console.error('Cancel submit error. ', e);
            callback('CancelErr');
        }
        app.info('Cancel offer - ' + seq + '.');
    }

    /**
     * 转换率获取
     * @param issuer:交易网关地址
     * @param callback
     */
    app.getXRPToCNYRate=function(callback){
        //var url = "https://data.ripple.com/v2/exchange_rates/XRP/CNY+rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y";
        var url="https://api.ripple.com/v1/accounts/"+ROBOT.WALLET.address+"/payments/paths/"+ROBOT.COUNTERPARTY.ripplefox+"/1+XRP+"+ROBOT.COUNTERPARTY.ripplefox+"?source_currencies=CNY";
        app.http(url).done(function(rtn){
            var result=0;
            if(rtn&&rtn.payments&&rtn.payments.length){
                result = parseFloat(rtn.payments[1].source_amount.value);
            }
            callback(null,result);
        }).fail(function(e){ callback(e,null); });
    };

    /**创建xrp买入单**/
    app.createBuyXrpOffers=function(address,amount,price,callback){
        var buy_amount = app.createAmount(amount, 'XRP', '');
        var sell_amount = app.createAmount(amount*price, 'CNY', ROBOT.COUNTERPARTY.ripplefox);
        app.createOffer(address, 'buy', buy_amount, sell_amount, function(err, seq) {
            if (err) { callback(err,null); } else { callback(null,seq); }
        });
    };

    /**创建xrp卖出单**/
    app.createSellXrpOffers=function(address,amount,price,callback){
        var sell_amount = app.createAmount(amount, 'XRP', '');
        var buy_amount = app.createAmount(amount*price, 'CNY', ROBOT.COUNTERPARTY.ripplefox);
        app.createOffer(address, 'sell', buy_amount, sell_amount, function(err, seq) {
            if (err) { callback(err,null); } else { callback(null,seq); }
        });
    };

    /**获取账户总账**/
    app.getAllBalance=function(address,callback){
        var url="https://data.ripple.com/v2/accounts/"+address+"/balances";
        app.http(url).done(function(rtn){callback(null,rtn.balances||[])}).fail(function(e){callback(e,null)});
    }

    app.info=function(str){
        console.log(str);
        str="["+app.getNowTime()+"]"+str;
        str=app.logContainer.val()+"\n"+str;
        app.logContainer.val(str);
    }

    /**报价表**/
    app.orderBook=function(callback){
        var options = {
            gets:  { currency: 'XRP'},
            pays: { issuer: ROBOT.COUNTERPARTY.ripplefox, currency: 'CNY'},
            limit: 5
        };
        var request = app.remote.requestBookOffers(options)
            .on('success', function(data){ callback(null, data);})
            .on('error', function(e){ callback(e, null); });
        request.timeout(ROBOT.REQUEST.timeout, function(){ callback('timeout', null);});

        try { request.request(); } catch (e) { callback(e, null);}
    };

    /**测试从服务器获取买价单**/
    app.getBidPrice=function(callback){
        var options = {
            gets:  { currency: 'XRP'},
            pays: { issuer: ROBOT.COUNTERPARTY.ripplefox, currency: 'CNY'},
            limit: 5,
            robot:ROBOT
        };
        app.http('http://104.160.38.181/v1/bid',options,{type:'POST'}).done(function(data){
            callback(null, data);
        });
    };

    app.getNowTime=function(){
        var now = new Date();
        return now.format("yyyy-MM-dd hh:mm:ss");
    }
};


/**
 * http请求
 * @param app
 * @private
 */
var __initHttp=function(app){
    app.http = function (url, param, options) {
        param = param || {};
        var dtd = $.Deferred();
        var opts =_.defaults(options||{},{ dataType:"json",type:"GET",cache:false,timeout:12000});
        opts= _.extend(opts,{data:param,url:url});
        $.ajax(opts).done(function (rtn) {
            dtd.resolve(rtn);
        }).fail(function (rtn) {
            console.log("error",rtn);
            dtd.reject(rtn);
        }).always(function () {});
        return dtd.promise();
    };
};

var __initDateFormat=function(){//日期格式化
    Date.prototype.format = function(format){
        var o = {
            "M+" : this.getMonth()+1, //month
            "d+" : this.getDate(), //day
            "h+" : this.getHours(), //hour
            "m+" : this.getMinutes(), //minute
            "s+" : this.getSeconds(), //second
            "q+" : Math.floor((this.getMonth()+3)/3), //quarter
            "S" : this.getMilliseconds() //millisecond
        };

        if(/(y+)/.test(format)) {
            format = format.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));
        }

        for(var k in o) {
            if(new RegExp("("+ k +")").test(format)) {
                format = format.replace(RegExp.$1, RegExp.$1.length==1 ? o[k] : ("00"+ o[k]).substr((""+ o[k]).length));
            }
        }
        return format;
    }
};

define(['jquery','underscore','ripple'],function(){
    var app={};

    $.support.cors = true;
    app.msg="";
    __initDateFormat();
    __initUtil(app);
    __initHttp(app);

    return app;
});