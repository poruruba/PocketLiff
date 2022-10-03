'use strict';

//const vConsole = new VConsole();
//window.datgui = new dat.GUI();

const LIFF_ID = "【LINEのLIFF ID】";
const base_url = "";

const POCKET_SEARCH_COUNT = 10;

var vue_options = {
    el: "#top",
    mixins: [mixins_bootstrap],
    data: {
        current_page: 0,
        search_count: POCKET_SEARCH_COUNT,
        item_list: [],
        num_of_page: 0,
        pocket_username: null,
        line_displayName: null,
        search_word: "",
        searching_word: "",
        line_loggedin: false,
        line_inClient: false,
    },
    computed: {
    },
    methods: {
        item_by_index: function(index){
            return this.item_list[this.current_page * this.search_count + index - 1];
        },
        urlopen_by_index: function(index){
            liff.openWindow({
                url: this.item_by_index(index).resolved_url,
                external: true,
            });
        },
        change_page: function(page){
            this.current_page = page;
        },
        change_prev: async function(){
            if( this.current_page > 0 )
                this.current_page--;
        },
        change_next: async function(){
            if( this.current_page < Math.ceil(this.item_list.length / this.search_count) - 1 )
                this.current_page++;
        },
        retrieve: async function(){
            if( !this.pocket_username ){
                alert('まだ登録されていません。');
                return;
            }
            this.searching_word = this.search_word;
            var result = await do_post(base_url + "/pocket-retrieve", {
                id_token: liff.getIDToken(),
                num_of_items: POCKET_SEARCH_COUNT,
                offset: 0,
                search: this.searching_word
            });
            console.log(result);

            this.current_page = 0;
            this.item_list = result.list;
            this.num_of_page = Math.ceil(this.item_list.length / this.search_count);
        },
        retrieve_last: async function(){
            if( !this.pocket_username ){
                alert('まだ登録されていません。');
                return;
            }
            var result = await do_post(base_url + "/pocket-retrieve", {
                id_token: liff.getIDToken(),
                num_of_items: POCKET_SEARCH_COUNT,
                offset: this.item_list.length,
                search: this.searching_word
            });
            console.log(result);
            if( Object.keys(result.list).length > 0 ){
                this.current_page = Math.ceil(this.item_list.length / this.search_count);
                this.item_list = this.item_list.concat(result.list);
                this.num_of_page = Math.ceil(this.item_list.length / this.search_count);
            }else{
                this.toast_show("最後のページです。");
            }
        },
        signin: async function(){
            var result = await do_post(base_url + "/pocket-signin", {
                id_token: liff.getIDToken(),
            });
            console.log(result);

            location.href = result.signin_url;
        },
        logout: async function(){
            if (liff.isLoggedIn()) {
                liff.logout();
                localStorage.removeItem('pocket_username');
                window.location.reload();
            }
        },
        initialize: async function(){
            try{
                this.line_inClient = liff.isInClient();
                this.line_loggedin = liff.isLoggedIn();
                console.log("isLoggedIn: " + this.line_loggedin);
                if( liff.isLoggedIn() ){
                    var payload = liff.getDecodedIDToken();
                    this.line_displayName = payload.name;
                    if( searchs.cmd == 'PocketSignin' ){
                        var result = await do_post(base_url + "/pocket-signin", {
                            id_token: liff.getIDToken(),
                            cmd: 'PocketSignin'
                        });
                        console.log(result);
                        localStorage.setItem("pocket_username", result.pocket_username);
                        this.pocket_username = result.pocket_username;
                        this.line_displayName = result.line_displayName;
                        alert('Pocketサインインし、登録が完了しました。');
                    }
                }else{
                    alert('最初にLINEログインが必要です。');
                    liff.login();
                }
            }catch(err){
                console.error(err);
                alert(err);
            }
        }
    },
    created: function(){
    },
    mounted: async function(){
        proc_load();

        liff.init({ liffId: LIFF_ID })
        .then( () => {
            this.initialize();
        })
        .catch( (err) => {
            console.error(err);
            alert(err);
        })
        .finally(() => {
            history.replaceState('', '', location.pathname);
        });

        this.pocket_username = localStorage.getItem('pocket_username');
    }
};
vue_add_data(vue_options, { progress_title: '' }); // for progress-dialog
vue_add_global_components(components_bootstrap);
vue_add_global_components(components_utils);

/* add additional components */
  
window.vue = new Vue( vue_options );

