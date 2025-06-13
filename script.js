const app = Vue.createApp({
    data() {
        return {
            lyricsInput: `夕焼小焼の　赤蜻蛉
負われて見たのは　いつの日か
山の畑の　桑の実を
小籠に摘つんだは　幻か
十五で姐やは　嫁に行き
お里の便りも　絶え果てた
夕焼小焼の　赤蜻蛉
止まっているよ　竿の先`,
            lines: [],
            tokenizer: null,
            isLoadingKuromoji: true,
            updateTimeout: null
        };
    },
    methods: {
        async initializeKuromoji() {
            this.isLoadingKuromoji = true;

            // file:// で開いた場合はブラウザのセキュリティ制限により XHR が失敗するため
            // CDN の辞書を使い、HTTP/HTTPS でホストされている場合はローカル辞書を使う
            const dicPath = (location.protocol === 'file:'
                ? 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict'
                : './dict');

            try {
                this.tokenizer = await new Promise((resolve, reject) => {
                    kuromoji.builder({ dicPath }).build((err, tokenizer) => {
                        if (err) {
                            console.error('Kuromoji initialization error:', err);
                            reject(err);
                        } else {
                            resolve(tokenizer);
                        }
                    });
                });
                console.log('Kuromoji initialized successfully.');
                this.isLoadingKuromoji = false;
                this.processLines(); // Now tokenizer ready and loading flag off
            } catch (error) {
                console.error('Failed to initialize Kuromoji:', error);
                alert('形態素解析エンジンの初期化に失敗しました。ページを再読み込みしてみてください。');
            } finally {
                if (this.isLoadingKuromoji) this.isLoadingKuromoji = false;
            }
        },
        hiraToKata(str) {
            return str.replace(/[\u3041-\u3096]/g, function(match) {
                const charCode = match.charCodeAt(0);
                if (charCode === 0x3094) return 'ヴ'; // ゔ -> ヴ
                return String.fromCharCode(charCode + 0x60);
            });
        },

        countMora(text) {
            if (!this.tokenizer || text.trim() === '') {
                return 0;
            }
            const tokens = this.tokenizer.tokenize(text);
            // デバッグ用: トークン化の結果をコンソールに出力したい場合は以下のコメントを解除
            // console.log(`Input: "${text}" -> Tokens:`, JSON.parse(JSON.stringify(tokens.map(t => ({surface: t.surface_form, reading: t.reading, pos: t.pos})))));

            let totalMoraCount = 0;
            const yoonModifiers = 'ァィゥェォャュョヮ'; // 拗音などを形成する小さいカタカナ

            tokens.forEach(token => {
                // モーラに含めない無音記号をスキップ
                if (token.pos === '記号' && token.surface_form !== 'ー') {
                    return; // continue forEach
                }

                let reading = token.reading;
                let effectiveStringToCount = ""; // モーラ計算の対象となるカタカナ文字列

                if (reading && reading !== '*') {
                    effectiveStringToCount = reading;
                } else {
                    // 読みがない場合のフォールバック処理
                    const surface = token.surface_form;
                    // 表記が仮名文字のみ（長音符、促音、繰り返し記号も含む）で構成されているかチェック
                    if (/^[\u3040-\u309F\u30A0-\u30FF\u30FC\u3005\u3063\u30C3]+$/.test(surface)) {
                        effectiveStringToCount = this.hiraToKata(surface); // カタカナに統一
                    }
                    // 上記以外（記号、アルファベット等で読みがないもの）はモーラ0として扱われる
                }

                if (effectiveStringToCount) {
                    let moraeInSegment = effectiveStringToCount.length;
                    let yoonModifierCountInSegment = 0;
                    for (let i = 0; i < effectiveStringToCount.length; i++) {
                        const char = effectiveStringToCount[i];
                        if (yoonModifiers.includes(char)) {
                            yoonModifierCountInSegment++;
                        }
                    }
                    totalMoraCount += (moraeInSegment - yoonModifierCountInSegment);
                }
            });
            return totalMoraCount;
        },
        processLines() {
            const linesArray = this.lyricsInput.split('\n');
            if (this.isLoadingKuromoji || !this.tokenizer) {
                this.lines = linesArray.map(lineText => ({
                    text: lineText,
                    moras: [] // Placeholder until kuromoji is ready, store as array
                }));
                return;
            }

            this.lines = linesArray.map(lineText => {
                const segments = lineText.split(/[　 ]+/).filter(seg => seg.length > 0); // Split by spaces
                let moras;
                if (segments.length === 0) {
                    moras = [0]; // 空行は0を表示
                } else {
                    moras = segments.map(segment => this.countMora(segment));
                }
                return {
                    text: lineText,
                    moras: moras
                };
            });
        },
        // Throttle updates to prevent excessive processing on fast typing
        updateCountsThrottled() {
            if (this.updateTimeout) {
                clearTimeout(this.updateTimeout);
            }
            this.updateTimeout = setTimeout(() => {
                this.processLines();
            }, 250); // Adjust delay as needed (e.g., 250ms)
        },
        syncScroll() {
            const lyrics = this.$refs.lyricsArea;
            const results = this.$refs.resultsArea;
            if (results) {
                results.scrollTop = lyrics.scrollTop;
            }
        },
        copyLyrics() {
            navigator.clipboard.writeText(this.lyricsInput).then(() => {
                alert('歌詞をコピーしました');
            }).catch(err => {
                console.error('Clipboard copy failed:', err);
            });
        },
        clearLyrics() {
            this.lyricsInput = '';
            this.processLines();
        }
    },
    watch: {
        lyricsInput() {
            this.updateCountsThrottled();
        }
    },
    mounted() {
        this.initializeKuromoji();
        // Initial rendering of mora counts with placeholders or cached tokenizer
        this.processLines();
    }
});

app.mount('#app');
