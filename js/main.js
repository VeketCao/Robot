/**
 * Created by admin on 2015/12/26.
 */
require(['app'],function(app){

    var remote;
    var isStopTimer=false;
    var currentXrpAmount=0;//当前账户xrp数量
    var currentCnyAmount=0;//当前账户cny数量
    var asksPrice=0;
    var bidsPrice=0;
    var intervalList=[];//间距表--区间交易法
    var db;

    /**
     * 获取当前买价所在的区间,查间距表
     */
    var getBuyInterval=function(){
        var result=[];
        for(var i=0;i<intervalList.length;i++){
            if(asksPrice>=intervalList[i]&&asksPrice<intervalList[i+1]){
                result.push(intervalList[i]);
                result.push(intervalList[i+1]);
                break;
            }
        }
        return result;
    };

    /**
     *准备买入
     * @param allBuyNum所有买入但（成交+未成交的），还没卖出
     * @param currBuyNum未成交的
     */
    var preCreateBuyOffers=function(allBuyOffers,s1Offers){
        app.info("pre create buy xrp offers...");
        var amount=ROBOT.ORDER.default_amount;
        var insertSql=function(seq,bids){
            db.transaction(function (tx) {
                tx.executeSql('INSERT INTO BUYS (seq,bids,status,asks) VALUES (?,?,?,?)', [seq,bids,0,0]);
            });
        };
        var isExistBidsOffer=function(v){
            var result=false;
            _.each(allBuyOffers,function(it){ if(it.bids==v) result=true});
            return result;
        };
        var intervalPrice=getBuyInterval();
        if(_.isEmpty(intervalPrice)) return;
        app.info("interval is:["+intervalPrice.toString()+"]");
        if(_.isEmpty(s1Offers)&&ROBOT.ORDER.s1_empty_to_buy){//立即买入一单--应对连续上涨情况
            //创建上限单
            var bids_up=asksPrice;
            if(isExistBidsOffer(bids_up)) return;
            if(bids_up*amount<currentCnyAmount){
                app.createBuyXrpOffers(ROBOT.WALLET.address,amount,bids_up,function(err,seq){
                    if(!err){
                        app.info("buy xrp offers created:"+seq);
                        insertSql(seq,intervalPrice[1]);//把当前价格作为上限单价格，但数据库记录真实上限
                    }
                });
            }
        }else{
            //创建下限单
            var bids_down=intervalPrice[0];
            if(isExistBidsOffer(bids_down)) return;//存在该下限价格单就不再创建;
            if(bids_down*amount<currentCnyAmount){
                app.createBuyXrpOffers(ROBOT.WALLET.address,amount,bids_down,function(err,seq){
                    if(!err){
                        app.info("buy xrp offers created:"+seq);
                        insertSql(seq,bids_down);//下限单
                    }
                });
            }
        }
    };

    /**
     * 准备卖出
     * @param s1成交的买入单
     */
    var preCreateSellOffers=function(s1){
        app.info("pre create sell xrp offers...");
        var amount=ROBOT.ORDER.default_amount;
        _.each(s1,function(it){
            if(it.bids<bidsPrice-ROBOT.ORDER.interval-ROBOT.ORDER.down_float_to_sell){
                app.createSellXrpOffers(ROBOT.WALLET.address,amount,bidsPrice,function(err,seq){
                    if(!err){
                        app.info("sell xrp offers created:"+seq);
                        db.transaction(function (tx) {//记录卖单
                            tx.executeSql('INSERT INTO SELLS (seq,bids,asks,times) VALUES (?,?,?,?)', [seq,it.bids,bidsPrice,app.getNowTime()]);
                        });
                    }
                });
                db.transaction(function (tx) {
                    tx.executeSql('DELETE FROM BUYS WHERE SEQ=?', [it.seq]);
                });

                /*if(it.asks>0&&(bidsPrice+ROBOT.ORDER.down_float_to_sell)<=it.asks){//站稳回落,创建卖单

                }else{//更新it.asks数据库--这样可以吃到连续涨的情况
                    db.transaction(function (tx) {
                        tx.executeSql("UPDATE BUYS SET ASKS=? WHERE SEQ = ?",[bidsPrice,it.seq]);
                        app.info("update buys set asks:"+bidsPrice);
                    });
                }*/
            }
        });
    };

    /**
     * 同步状态
     * @param currBuyOffers
     */
    var changeLocalStatus=function(currBuyOffers){
        db.transaction(function (tx) {
            tx.executeSql("SELECT * FROM BUYS",[],function(tx,result){
                if(result.rows.length==0){//当前无买单
                    preCreateBuyOffers(result.rows,[]);
                }else{
                    var s0= _.filter(result.rows,function(it){return it.status==0});
                    var s1=_.filter(result.rows,function(it){return it.status==1});
                    _.each(s0,function(item){
                        var temp= _.find(currBuyOffers,function(it){return it.seq==item.seq});
                        if(_.isEmpty(temp)){
                            item.status=1;
                            s1.push(item);
                            tx.executeSql("UPDATE BUYS SET STATUS=? WHERE SEQ = ?",[1,item.seq]);
                            app.info("success to buy offer:"+item.seq);
                        }
                    });
                    preCreateBuyOffers(result.rows,s1);
                    preCreateSellOffers(s1);
                }
            });
        });
    };

    /**查询所有委托单**/
    var queryOffers=function(){
        app.info("query offers...");
        app.accountOffers(ROBOT.WALLET.address,function(err,data){
            var offers=data.offers||[];
            var currBuyOffers= _.filter(offers,function(it){return it.flags==0})||[];
            //var currSellOffers= _.filter(offers,function(it){return it.flags!=0});
            changeLocalStatus(currBuyOffers);
        });
    };

    /**查询买价单**/
    var queryBidPrice=function(){
        app.info("query bids...");
        app.getBidPrice(function(err,data){
            if(!_.isEmpty(data)) bidsPrice=data;
        });
    };

    /**查报价**/
    var queryOrderBook=function(){
        app.info("query order book...");
        app.orderBook(function(err,data){
            if(!err){
                asksPrice=data.offers[0].quality*1000000;
                bidsPrice=asksPrice-ROBOT.ORDER.interval;
                $("#asks_sp").text(asksPrice);
                queryBidPrice();
                queryOffers();
            }
        });
    };

    /**查询总账**/
    var queryAccountBalance=function(){
        app.info("query balance...");
        app.getAllBalance(ROBOT.WALLET.address,function(err,items){
            if(!err){
                _.each(items||[],function(item){
                    if(item.currency=="XRP"){ currentXrpAmount+=parseFloat(item.value); }
                    if(item.currency=="CNY"){ currentCnyAmount+=parseFloat(item.value); }
                });
                $("#xrp_sp").text(currentXrpAmount);
                $("#cny_sp").text(currentCnyAmount);
                queryOrderBook();
            }
        });
    };

    /**定时器**/
    var timer=function(cb,time){
        if(!isStopTimer){
            if(cb&&typeof(cb)=="function")cb();
            setTimeout(function() {timer(cb,time)},time);
        }
    };

    /**需要执行的定时任务**/
    var timerTask=function(){
        app.info("timer task...");
        currentXrpAmount=0;
        currentCnyAmount=0;
        asksPrice=0;
        bidsPrice=0;
        queryAccountBalance();
    };

    var initIntervalList=function(){
        app.info("init interval list...");
        intervalList=[];
        var temp=ROBOT.ORDER.min_value;
        do{
            intervalList.push(temp);
            temp=parseFloat((temp+ROBOT.ORDER.interval).toFixed(6));
        }while(temp<=ROBOT.ORDER.max_value);
    };

    /**开始**/
    var startWorking=function(){
        if(!initSetting()) return;
        $("#start_btn").attr("disabled","true");
        app.info("start working...");
        app.info("account is "+ROBOT.WALLET.address);
        initIntervalList();
        app.remote=remote =new ripple.Remote(ROBOT.REMOTE);
        remote.connect(function(){
            remote.setSecret(ROBOT.WALLET.address,ROBOT.WALLET.secret);
            app.info("server connected...");
            timer(timerTask,ROBOT.TIMER_TASK);//执行定时任务
        });
    };

    /**结束**/
    var stopWorking=function(){
        $("#start_btn").removeAttr("disabled");
        isStopTimer=true;
        remote=null;
        asksPrice=0;
        bidsPrice=0;
        currentXrpAmount=0;
        currentCnyAmount=0;
        app.info("finished...");
    };

    var clearDB=function(){
        if(confirm('是否初始化数据库？请谨慎操作!')){
            app.info("init database...");
            db.transaction(function (tx) {
                tx.executeSql('DROP TABLE BUYS');
                tx.executeSql('DROP TABLE SELLS');
                initDB();
            });
        }
    };

    var initDB=function(){
        db = openDatabase('rpdb', '1.0', 'rp DB', 2 * 1024 * 1024);
        db.transaction(function (tx) {
            tx.executeSql('CREATE TABLE IF NOT EXISTS BUYS (seq unique, bids, status,asks)');
            tx.executeSql('CREATE TABLE IF NOT EXISTS SELLS (seq unique, bids,asks,times)');
        });
    };

    var clearSells=function(){
        if(confirm('是否删除sells数据？请谨慎操作!')){
            app.info("init sells...");
            db.transaction(function (tx) {
                tx.executeSql('DROP TABLE SELLS');
                tx.executeSql('CREATE TABLE IF NOT EXISTS SELLS (seq unique, bids,asks,times)');
            });
        }
    };

    var bindEvent=function(){
        $("#start_btn").bind("click",startWorking);
        $("#stop_btn").bind("click",stopWorking);
        $("#db_btn").bind("click",clearDB);
        $("#sells_btn").bind("click",clearSells);
    };

    var initSetting=function () {
        var result = true;
        ROBOT.WALLET.address = $.trim($("#xrp_address").val());
        ROBOT.WALLET.secret = $.trim($("#xrp_key").val());
        if(_.isEmpty(ROBOT.WALLET.address)){
            app.info("ripple address not empty");
            result= false;
        }
        if(_.isEmpty(ROBOT.WALLET.secret)){
            app.info("ripple secret not empty");
            result= false;
        }
        return result;
    };

    var initPage=function(){
        bindEvent();
        initDB();//初始化浏览器数据库
        app.logContainer=$("#log_info");
    };

    initPage();
});