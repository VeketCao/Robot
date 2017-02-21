/**
 * Created by admin on 2015/9/28.
 */
var ROBOT={
    REQUIRE:{
        'paths':{
            'jquery':'lib/jquery/jquery.min',
            'text':'lib/require/text.min',
            'css':'lib/require/css.min',
            'domReady':'lib/require/domReady.min',
            'underscore':'lib/underscore/underscore-min',
            'ripple':'lib/ripple/ripple-0.12.0-min',
            'app':'js/app-util'
        },
        'shim':{
            'jquery':{'exports':'$'},
            'underscore': {'exports': '_'}
        },
        'urlArgs':'v=1.0.0'
    },
    COUNTERPARTY:{
        ripplefox:'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'//网关地址
    },
    REQUEST:{
        timeout:20000
    },
    REMOTE:{
        max_listeners : 100,
        trace : false,
        trusted : true,
        local_signing : true,
        connection_offest : 60,
        servers:[{host:'s-west.ripple.com',port:443,secure:true,pool:3},{host:'s-east.ripple.com',port:443,secure:true,pool:3}]
    },
    TIMER_TASK:30000,//定时任务
    WALLET:{
        address:'',//钱包地址
        secret:''//钱包密钥
    },
    ORDER:{
        min_value:0.04,//下限
        max_value:0.07,//上限
        interval:0.0002,//间距
        default_amount:2000,//每单默认值
        s1_empty_to_buy:true,//立即买入一单
        down_float_to_sell:0.00005//连续上涨后回落点数立马卖出
    }
};

require.config(ROBOT.REQUIRE);
