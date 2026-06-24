
        // ========== Particle Background ==========
        const canvas = document.getElementById('particles');
        const ctx = canvas.getContext('2d');
        let particles = [];

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        function createParticle() {
            return {
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 3 + 1,
                speedX: (Math.random() - 0.5) * 0.5,
                speedY: (Math.random() - 0.5) * 0.5,
                opacity: Math.random() * 0.5 + 0.1
            };
        }

        function initParticles() {
            particles = [];
            const isMobile = window.innerWidth < 768;
            const particleCount = isMobile ? 20 : 50;
            for (let i = 0; i < particleCount; i++) particles.push(createParticle());
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;
                if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
                if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(231, 76, 60, ${p.opacity})`;
                ctx.fill();
            });
            requestAnimationFrame(animateParticles);
        }

        resizeCanvas();
        initParticles();
        let particleRAF;
        function loopParticles() { animateParticles(); particleRAF = requestAnimationFrame(loopParticles); }
        document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(particleRAF); else loopParticles(); });
        loopParticles();
        window.addEventListener('resize', () => { resizeCanvas(); initParticles(); });

        // ========== Dark Mode ==========
        function toggleDarkMode() {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('darkMode', isDark);
            document.getElementById('themeIcon').textContent = isDark ? '☀️' : '🌙';
            document.getElementById('mobileThemeIcon').textContent = isDark ? '☀️' : '🌙';
            showToast(isDark ? '已切換至深色模式' : '已切換至淺色模式');
        }

        // Load saved theme
        if (localStorage.getItem('darkMode') === 'true') {
            document.documentElement.classList.add('dark');
            document.getElementById('themeIcon').textContent = '☀️';
            document.getElementById('mobileThemeIcon').textContent = '☀️';
        }

        // ========== Language Toggle ==========
        let currentLang = localStorage.getItem('tokyoLang') || 'zh-TW';
        
        const translations = {
            'zh-TW': {
                flights: '航班資訊',
                transfer: '交通',
                hotel: '住宿',
                routemap: '路線圖',
                map: '景點地圖',
                itinerary: '行程',
                tools: '實用工具',
                food: '美食',
                tips: '小提醒',
                heroTitle: '🗼 東京自由行',
                heroSubtitle: '與毓寧的第一次愛的旅行',
                todayItinerary: '📋 查看今日行程'
            },
            'ja': {
                flights: 'フライト',
                transfer: '交通',
                hotel: '宿泊',
                routemap: '路線図',
                map: 'スポット',
                itinerary: '旅程',
                tools: 'ツール',
                food: 'グルメ',
                tips: 'ヒント',
                heroTitle: '🗼 東京自由旅行',
                heroSubtitle: '日本の首都の魅力を探索',
                todayItinerary: '📋 今日の旅程を見る'
            }
        };

        function toggleLanguage() {
            currentLang = currentLang === 'zh-TW' ? 'ja' : 'zh-TW';
            localStorage.setItem('tokyoLang', currentLang);
            document.getElementById('langIcon').textContent = currentLang === 'zh-TW' ? '🇹🇼' : '🇯🇵';
            applyLanguage();
            showToast(currentLang === 'zh-TW' ? '已切換至中文' : '日本語に切替しました');
        }

        function applyLanguage() {
            const t = translations[currentLang];
            if (!t) return;
            
            // Update nav links
            document.querySelectorAll('.nav-links a[data-section]').forEach(link => {
                const section = link.dataset.section;
                if (t[section]) link.textContent = t[section];
            });
            
            // Update mobile nav
            document.querySelectorAll('.mobile-nav a[data-section]').forEach(link => {
                const section = link.dataset.section;
                if (t[section]) link.textContent = link.textContent.replace(/^.+\s/, t[section] + ' ');
            });
            
            // Update hero
            const heroH1 = document.querySelector('.hero h1');
            if (heroH1) heroH1.textContent = t.heroTitle;
            const heroSubtitle = document.querySelector('.hero .subtitle');
            if (heroSubtitle) heroSubtitle.textContent = t.heroSubtitle;
            const todayBtn = document.querySelector('.hero button');
            if (todayBtn) todayBtn.innerHTML = t.todayItinerary;
        }

        // Load saved language
        if (localStorage.getItem('tokyoLang')) {
            document.getElementById('langIcon').textContent = currentLang === 'zh-TW' ? '🇹🇼' : '🇯🇵';
            applyLanguage();
        }

        // ========== Mobile Nav ==========
        function toggleMobileNav() {
            document.getElementById('hamburger').classList.toggle('active');
            document.getElementById('mobileNav').classList.toggle('open');
            document.body.style.overflow = document.getElementById('mobileNav').classList.contains('open') ? 'hidden' : '';
        }

        function closeMobileNav() {
            document.getElementById('hamburger').classList.remove('active');
            document.getElementById('mobileNav').classList.remove('open');
            document.body.style.overflow = '';
        }

        // ========== Navigation ==========
        const navbar = document.getElementById('navbar');
        const backToTop = document.getElementById('backToTop');
        const scrollProgress = document.getElementById('scrollProgress');
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('visible', window.pageYOffset > 300);
            backToTop.classList.toggle('visible', window.pageYOffset > 500);
            // Scroll progress
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrolled = (window.pageYOffset / scrollHeight) * 100;
            scrollProgress.style.width = scrolled + '%';
        });

        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });

        // ========== Navigation Active State ==========
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-links a[data-section]');
        
        function updateActiveNav() {
            let current = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                if (window.pageYOffset >= sectionTop - 200) {
                    current = section.getAttribute('id');
                }
            });
            
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('data-section') === current) {
                    link.classList.add('active');
                }
            });
        }

        window.addEventListener('scroll', updateActiveNav);
        updateActiveNav();

        // ========== Countdown ==========
        function updateCountdown() {
            const tripDate = new Date('2026-09-01T08:30:00+09:00');
            const diff = tripDate - new Date();
            if (diff > 0) {
                document.getElementById('days').textContent = Math.floor(diff / 86400000);
                document.getElementById('hours').textContent = Math.floor((diff % 86400000) / 3600000);
                document.getElementById('minutes').textContent = Math.floor((diff % 3600000) / 60000);
                document.getElementById('seconds').textContent = Math.floor((diff % 60000) / 1000);
            }
        }
        setInterval(updateCountdown, 1000);
        updateCountdown();

        // ========== Tabs ==========
        function showTab(dayId, el) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(dayId).classList.add('active');
            if (el) el.classList.add('active');
        }

        // ========== Toggle Day ==========
        function toggleDay(header) {
            const content = header.nextElementSibling;
            content.classList.toggle('expanded');
            const icon = header.querySelector('.fa-chevron-down');
            if (icon) icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0)';
        }

        // ========== Currency Converter ==========
        const exchangeRate = 5;
        function convertCurrency(source) {
            const twdInput = document.getElementById('twdAmount');
            const jpyInput = document.getElementById('jpyAmount');
            const result = document.getElementById('converterResult');
            if (source === 'twd') {
                const twd = parseFloat(twdInput.value) || 0;
                jpyInput.value = Math.round(twd * exchangeRate);
                result.textContent = `NT$ ${twd.toLocaleString()} ≈ ¥${Math.round(twd * exchangeRate).toLocaleString()}`;
            } else {
                const jpy = parseFloat(jpyInput.value) || 0;
                twdInput.value = Math.round(jpy / exchangeRate);
                result.textContent = `¥${jpy.toLocaleString()} ≈ NT$ ${Math.round(jpy / exchangeRate).toLocaleString()}`;
            }
        }

        function swapCurrency() {
            const twdInput = document.getElementById('twdAmount');
            const jpyInput = document.getElementById('jpyAmount');
            const temp = twdInput.value;
            twdInput.value = jpyInput.value;
            jpyInput.value = temp;
            if (twdInput.value) convertCurrency('twd');
            else if (jpyInput.value) convertCurrency('jpy');
            else document.getElementById('converterResult').textContent = '請輸入金額換算';
        }

        // ========== Checklist ==========
        const CHECKLIST_ITEMS = 18;
        
        function saveChecklist() {
            const checklist = {};
            let checked = 0;
            for (let i = 1; i <= CHECKLIST_ITEMS; i++) {
                const cb = document.getElementById(`item${i}`);
                if (cb) {
                    checklist[`item${i}`] = cb.checked;
                    if (cb.checked) checked++;
                    cb.closest('.checklist-item').classList.toggle('checked', cb.checked);
                }
            }
            localStorage.setItem('tokyoChecklist', JSON.stringify(checklist));
            const percent = Math.round((checked / CHECKLIST_ITEMS) * 100);
            document.getElementById('checklistProgress').style.width = percent + '%';
            document.getElementById('checklistPercent').textContent = `完成 ${percent}%`;
        }

        function loadChecklist() {
            const saved = localStorage.getItem('tokyoChecklist');
            if (saved) {
                const checklist = JSON.parse(saved);
                let checked = 0;
                for (let i = 1; i <= CHECKLIST_ITEMS; i++) {
                    const cb = document.getElementById(`item${i}`);
                    if (cb && checklist[`item${i}`]) { cb.checked = true; checked++; }
                    if (cb) cb.closest('.checklist-item').classList.toggle('checked', cb.checked);
                }
                const percent = Math.round((checked / CHECKLIST_ITEMS) * 100);
                document.getElementById('checklistProgress').style.width = percent + '%';
                document.getElementById('checklistPercent').textContent = `完成 ${percent}%`;
            }
        }

        // ========== Budget Tracker ==========
        let budgetItems = JSON.parse(localStorage.getItem('tokyoBudget') || '[]');
        const budgetLimit = 100000;
        const catConfig = {
            food:      { icon: '🍽️', label: '餐飲', color: '#e74c3c' },
            transport: { icon: '🚃', label: '交通', color: '#3498db' },
            shopping:  { icon: '🛍️', label: '購物', color: '#e91e63' },
            ticket:    { icon: '🎫', label: '門票', color: '#9b59b6' },
            hotel:     { icon: '🏨', label: '住宿', color: '#27ae60' },
            other:     { icon: '📦', label: '其他', color: '#f39c12' }
        };

        function drawPie() {
            const canvas = document.getElementById('budgetPie');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width, h = canvas.height, r = 70, cx = w/2, cy = h/2;
            ctx.clearRect(0, 0, w, h);

            const cats = {};
            budgetItems.forEach(i => {
                const cat = catConfig[i.category] ? i.category : 'other';
                cats[cat] = (cats[cat] || 0) + i.amount;
            });

            const total = Object.values(cats).reduce((a, b) => a + b, 0);
            if (total === 0) return;

            let start = -Math.PI / 2;
            const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
            sorted.forEach(([cat, amt]) => {
                const slice = (amt / total) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, r, start, start + slice);
                ctx.closePath();
                ctx.fillStyle = catConfig[cat]?.color || '#999';
                ctx.fill();
                start += slice;
            });

            // Inner circle for donut
            ctx.beginPath();
            ctx.arc(cx, cy, 45, 0, Math.PI * 2);
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim() || '#fff';
            ctx.fill();

            document.getElementById('pieTotal').textContent = `¥${total.toLocaleString()}`;

            // Legend
            const legend = document.getElementById('budgetLegend');
            legend.innerHTML = sorted.map(([cat, amt]) => `
                <div class="legend-item">
                    <span class="legend-dot" style="background:${catConfig[cat]?.color || '#999'}"></span>
                    <span>${catConfig[cat]?.icon || '📦'} ${catConfig[cat]?.label || cat}</span>
                    <span class="legend-amount">¥${amt.toLocaleString()}</span>
                    <span class="legend-pct">${Math.round(amt / total * 100)}%</span>
                </div>
            `).join('');
        }

        function renderBudget() {
            const list = document.getElementById('budgetList');
            const spent = budgetItems.reduce((sum, i) => sum + i.amount, 0);
            const pct = Math.min(Math.round((spent / budgetLimit) * 100), 100);

            document.getElementById('budgetTotal').textContent = `¥${budgetLimit.toLocaleString()}`;
            document.getElementById('budgetSpent').textContent = `¥${spent.toLocaleString()}`;
            document.getElementById('budgetRemaining').textContent = `¥${Math.max(budgetLimit - spent, 0).toLocaleString()}`;
            document.getElementById('budgetProgressLabel').textContent = `已使用 ¥${spent.toLocaleString()} / ¥${budgetLimit.toLocaleString()}`;

            const bar = document.getElementById('budgetProgressBar');
            bar.style.width = pct + '%';
            bar.classList.toggle('over', spent > budgetLimit);

            const chartArea = document.getElementById('budgetChartArea');
            chartArea.style.display = budgetItems.length > 0 ? 'flex' : 'none';
            drawPie();

            if (budgetItems.length === 0) {
                list.innerHTML = '<div class="budget-empty">還沒有任何消費紀錄<br>開始記帳吧！</div>';
                return;
            }

            // Group by date
            const grouped = {};
            budgetItems.forEach((item, idx) => {
                const d = item.date || '未設定日期';
                if (!grouped[d]) grouped[d] = [];
                grouped[d].push({ ...item, idx });
            });

            let html = '';
            Object.keys(grouped).sort().reverse().forEach(date => {
                const dayTotal = grouped[date].reduce((s, i) => s + i.amount, 0);
                html += `<div class="budget-day-header">📅 ${date} <span style="float:right;font-weight:400;font-size:0.9rem;color:var(--text-light)">小計 ¥${dayTotal.toLocaleString()}</span></div>`;
                grouped[date].forEach(item => {
                    const catKey = catConfig[item.category] ? item.category : 'other';
                    html += `
                        <div class="budget-list-item">
                            <div class="item-info">
                                <span class="item-cat">${item.category}</span>
                                <span class="item-name">${item.name}</span>
                            </div>
                            <span class="item-amount">¥${item.amount.toLocaleString()}</span>
                            <button class="delete-btn" onclick="deleteBudgetItem(${item.idx})"><i class="fas fa-trash"></i></button>
                        </div>`;
                });
            });
            list.innerHTML = html;
        }

        function addBudgetItem() {
            const name = document.getElementById('budgetName').value.trim();
            const amount = parseInt(document.getElementById('budgetAmount').value);
            const category = document.getElementById('budgetCategory').value;
            const dateInput = document.getElementById('budgetDate').value;
            const date = dateInput || new Date().toISOString().slice(0, 10);
            const icons = { food: '🍽️', transport: '🚃', shopping: '🛍️', ticket: '🎫', hotel: '🏨', other: '📦' };
            if (!name || !amount) { showToast('請填寫完整資訊'); return; }
            budgetItems.push({ name, amount, category: category, date });
            localStorage.setItem('tokyoBudget', JSON.stringify(budgetItems));
            document.getElementById('budgetName').value = '';
            document.getElementById('budgetAmount').value = '';
            renderBudget();
            showToast('已新增預算項目');
        }

        function deleteBudgetItem(idx) {
            budgetItems.splice(idx, 1);
            localStorage.setItem('tokyoBudget', JSON.stringify(budgetItems));
            renderBudget();
            showToast('已刪除項目');
        }

        // Set default date to today
        document.getElementById('budgetDate').value = new Date().toISOString().slice(0, 10);

        renderBudget();

        // ========== Weather Forecast ==========
        const weatherData = [
            { day: '9/1', icon: '🌤️', temp: '28°C', desc: '晴時多雲' },
            { day: '9/2', icon: '⛅', temp: '27°C', desc: '多雲時晴' },
            { day: '9/3', icon: '🌧️', temp: '25°C', desc: '午後雷陣雨' },
            { day: '9/4', icon: '☀️', temp: '29°C', desc: '晴朗' },
            { day: '9/5', icon: '🌤️', temp: '28°C', desc: '晴時多雲' },
            { day: '9/6', icon: '⛅', temp: '27°C', desc: '多雲' }
        ];

        function renderWeather() {
            const forecast = document.getElementById('weatherForecast');
            forecast.innerHTML = weatherData.map((w, i) => `
                <div class="weather-day ${i === 0 ? 'active' : ''}" onclick="selectWeather(${i})">
                    <div class="day-label">${w.day}</div>
                    <div class="day-icon">${w.icon}</div>
                    <div class="day-temp">${w.temp}</div>
                </div>
            `).join('');
        }

        function selectWeather(idx) {
            document.querySelectorAll('.weather-day').forEach(d => d.classList.remove('active'));
            document.querySelectorAll('.weather-day')[idx].classList.add('active');
            document.getElementById('weatherTemp').textContent = weatherData[idx].temp;
            document.getElementById('weatherDesc').textContent = weatherData[idx].desc;
        }

        renderWeather();

        // ========== FAB Menu ==========
        function toggleFab() {
            document.getElementById('fabContainer').classList.toggle('open');
        }

        function scrollToSection(id) {
            document.getElementById('fabContainer').classList.remove('open');
            document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
        }

        // Close FAB when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.fab-container')) {
                document.getElementById('fabContainer').classList.remove('open');
            }
        });

        // ========== Toast Notification ==========
        function showToast(msg) {
            const toast = document.getElementById('toast');
            document.getElementById('toastMsg').textContent = msg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

        // ========== Copy to Clipboard ==========
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => showToast(`已複製：${text}`));
        }

        // ========== Share Functions ==========
        function shareToFacebook() {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank');
        }

        function shareToLine() {
            window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(window.location.href)}`, '_blank');
        }

        function shareToTwitter() {
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('東京自由行 9/1-9/6 🗼')}&url=${encodeURIComponent(window.location.href)}`, '_blank');
        }

        function copyTripLink() {
            copyToClipboard(window.location.href);
        }

        // ========== Destination Map ==========
        const mapInfo = {
            hotel:      { title: '🏨 東武黎凡特飯店', desc: 'JR總武線錦系町站步行5分鐘，含早餐、大浴場。東武晴空塔線可直達淺草。' },
            asakusa:    { title: '🏯 淺草寺・雷門', desc: '東京最古老寺廟，仲見世通買零食人形燒。搭銀座線或東武線可達。' },
            skytree:    { title: '🗼 東京晴空塔', desc: '634m 東京最高建築，350m/450m展望台欣賞夜景。從錦系町搭東武線10分鐘。' },
            ueno:       { title: '🌸 上野阿美橫丁', desc: '最後採購伴手禮的好地方，藥妝、零食、電器都有。JR總武線直達。' },
            akiba:      { title: '🎮 秋葉原電氣街', desc: '動漫、電器、女僕咖啡廳。銀座線直達，從淺草搭2站。' },
            tokyo:      { title: '🚉 東京車站', desc: '紅磚車站建築，地下一番街購物。N\u0027EX終點站，轉乘各線的中心。' },
            ginza:      { title: '💎 銀座商店街', desc: '東京最高級商店街，百貨公司林立。銀座線可達。' },
            shibuya:    { title: '🐕 澀谷 Scramble Square', desc: '十字路口、忠犬八公像、Sky展望台。JR總武線或銀座線直達。' },
            shinjuku:   { title: '🛍️ 新宿購物區', desc: '思出橫丁美食、歌舞伎町夜生活。都營新宿線從錦系町直達。' },
            harajuku:   { title: '👘 原宿竹下通', desc: '年輕人潮流聖地，個性小店與甜點。JR總武線原宿站。' },
            toyosu:     { title: '🐟 豐洲市場', desc: '築地遷移後的新市場，新鮮海鮮早餐。有樂町線或百合海鷗號。' },
            odaiba:     { title: '🎡 台場', desc: '海濱公園、teamLab Borderless、1:1鋼彈。百合海鷗號直達。' },
            kichijoji:  { title: '🌿 吉祥寺', desc: '井之頭公園划船、口琴橫丁懷舊商店街。JR中央線直達。' },
            shimokita:  { title: '🎸 下北澤', desc: '古著街、獨立書店、咖哩名店。小田急線或井之頭線。' }
        };

        // ========== Favorites ==========
        let favorites = JSON.parse(localStorage.getItem('tokyoFavorites') || '[]');
        
        function toggleFavorite(key) {
            const idx = favorites.indexOf(key);
            if (idx > -1) {
                favorites.splice(idx, 1);
                showToast('已移除收藏');
            } else {
                favorites.push(key);
                showToast('已加入收藏 ❤️');
            }
            localStorage.setItem('tokyoFavorites', JSON.stringify(favorites));
            updateFavoriteButtons();
        }
        
        function updateFavoriteButtons() {
            document.querySelectorAll('.favorite-btn').forEach(btn => {
                const key = btn.dataset.key;
                const isFav = favorites.includes(key);
                btn.innerHTML = isFav ? '❤️' : '🤍';
                btn.title = isFav ? '取消收藏' : '加入收藏';
            });
        }

        function showMapInfo(key) {
            const info = mapInfo[key];
            if (!info) return;
            const popup = document.getElementById('mapPopup');
            const isFav = favorites.includes(key);
            document.getElementById('mapPopupContent').innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.4rem;">
                    <div style="font-size:1.1rem;font-weight:700;color:var(--secondary);">${info.title}</div>
                    <button class="favorite-btn" data-key="${key}" onclick="toggleFavorite('${key}')" style="background:none; border:none; cursor:pointer; font-size:1.2rem; padding:0;">${isFav ? '❤️' : '🤍'}</button>
                </div>
                <div style="font-size:0.95rem;color:var(--text-light);line-height:1.6;">${info.desc}</div>
            `;
            popup.style.display = 'block';
            // Position popup safely within viewport
            const isMobile = window.innerWidth < 768;
            if (isMobile) {
                popup.style.top = '50%';
                popup.style.left = '10px';
                popup.style.right = '10px';
                popup.style.maxWidth = 'none';
                popup.style.transform = 'translateY(-50%)';
            } else {
                popup.style.top = '50%';
                popup.style.left = '50%';
                popup.style.right = 'auto';
                popup.style.maxWidth = '250px';
                popup.style.transform = 'translate(-50%, -50%)';
            }
        }

        // ========== Map Zoom ==========
        let mapScale = 1;
        let mapTranslateX = 0;
        let mapTranslateY = 0;
        const mapSvg = document.querySelector('#mapSvg svg');
        
        function updateMapTransform() {
            if (mapSvg) {
                mapSvg.style.transform = `translate(${mapTranslateX}px, ${mapTranslateY}px) scale(${mapScale})`;
                mapSvg.style.transformOrigin = 'center center';
            }
        }
        
        function zoomMap(factor) {
            mapScale *= factor;
            mapScale = Math.max(0.5, Math.min(3, mapScale));
            updateMapTransform();
        }
        
        function resetMapZoom() {
            mapScale = 1;
            mapTranslateX = 0;
            mapTranslateY = 0;
            updateMapTransform();
        }
        
        // Touch zoom support
        let lastTouchDistance = 0;
        const mapContainer = document.getElementById('mapSvg');
        
        if (mapContainer) {
            mapContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    lastTouchDistance = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                }
            });
            
            mapContainer.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const distance = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    const factor = distance / lastTouchDistance;
                    zoomMap(factor);
                    lastTouchDistance = distance;
                }
            }, { passive: false });
        }

        // ========== Custom Food Map ==========
        let customFoods = JSON.parse(localStorage.getItem('tokyoCustomFoods') || '[]');
        
        function parseMapLink(url) {
            if (!url) return;
            try {
                const urlObj = new URL(url);
                if (urlObj.hostname.includes('google.com') || urlObj.hostname.includes('maps.app.goo.gl')) {
                    const nameInput = document.getElementById('customFoodName');
                    const locInput = document.getElementById('customFoodLocation');
                    
                    const placeMatch = url.match(/\/maps\/place\/([^/@]+)/);
                    if (placeMatch && !nameInput.value) {
                        nameInput.value = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
                    }
                    
                    const qMatch = url.match(/[?&]q=([^&]+)/);
                    if (qMatch && !nameInput.value) {
                        nameInput.value = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
                    }
                    
                    if (!nameInput.value && url.includes('maps.app.goo.gl')) {
                        showToast('已偵測到 Google Maps 連結，請手動輸入店名');
                    }
                }
            } catch(e) {}
        }
        
        // Image preview
        document.getElementById('customFoodImage').addEventListener('input', function(e) {
            const url = e.target.value.trim();
            const preview = document.getElementById('imagePreview');
            const img = document.getElementById('previewImg');
            if (url) {
                img.src = url;
                img.onerror = function() { preview.style.display = 'none'; };
                img.onload = function() { preview.style.display = 'block'; };
            } else {
                preview.style.display = 'none';
            }
        });
        
        function clearImagePreview() {
            document.getElementById('customFoodImage').value = '';
            document.getElementById('imagePreview').style.display = 'none';
        }
        
        function addCustomFood() {
            const emoji = document.getElementById('customFoodEmoji').value;
            const name = document.getElementById('customFoodName').value.trim();
            const location = document.getElementById('customFoodLocation').value.trim();
            const hours = document.getElementById('customFoodHours').value.trim();
            const desc = document.getElementById('customFoodDesc').value.trim();
            const mapLink = document.getElementById('customFoodMapLink').value.trim();
            const image = document.getElementById('customFoodImage').value.trim();
            
            if (!name) {
                showToast('請輸入店名');
                return;
            }
            
            customFoods.push({
                id: Date.now(),
                emoji,
                name,
                location: location || '未設定',
                hours: hours || '未設定',
                desc: desc || '美味推薦',
                mapLink: mapLink || '',
                image: image || ''
            });
            
            localStorage.setItem('tokyoCustomFoods', JSON.stringify(customFoods));
            renderCustomFoods();
            clearFoodForm();
            showToast('已加入美食地圖！');
        }
        
        function deleteCustomFood(id) {
            customFoods = customFoods.filter(f => f.id !== id);
            localStorage.setItem('tokyoCustomFoods', JSON.stringify(customFoods));
            renderCustomFoods();
            showToast('已移除美食');
        }
        
        function renderCustomFoods() {
            const list = document.getElementById('customFoodList');
            const empty = document.getElementById('customFoodEmpty');
            
            if (customFoods.length === 0) {
                list.innerHTML = '';
                empty.style.display = 'block';
                return;
            }
            
            empty.style.display = 'none';
            list.innerHTML = customFoods.map(food => `
                <div class="food-card" style="position:relative; padding:0; overflow:hidden;">
                    <button onclick="deleteCustomFood(${food.id})" style="position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.5); border:none; cursor:pointer; font-size:0.9rem; color:white; padding:4px 8px; border-radius:50%; z-index:2;" title="刪除">✕</button>
                    ${food.image ? `<div style="width:100%; height:140px; overflow:hidden;"><img src="${food.image}" style="width:100%; height:100%; object-fit:cover;" alt="${food.name}" onerror="this.parentElement.style.display='none'"></div>` : `<div style="width:100%; height:100px; background:var(--gradient); display:flex; align-items:center; justify-content:center; font-size:3rem;">${food.emoji}</div>`}
                    <div style="padding:0.8rem;">
                        <div style="display:flex; align-items:center; gap:0.3rem; margin-bottom:0.3rem;">
                            <span style="font-size:1.2rem;">${food.emoji}</span>
                            <h4 style="font-size:0.95rem; margin:0;">${food.name}</h4>
                        </div>
                        <p style="font-size:0.8rem; color:var(--text-light); margin-bottom:0.3rem; line-height:1.3;">${food.desc}</p>
                        <span class="location" style="font-size:0.7rem;">📍 ${food.location}</span>
                        <span class="hours" style="font-size:0.65rem;">⏰ ${food.hours}</span>
                        ${food.mapLink ? `<a href="${food.mapLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:0.4rem; padding:0.2rem 0.6rem; background:var(--primary); color:white; border-radius:10px; font-size:0.7rem; text-decoration:none;">🗺️ 導航</a>` : ''}
                    </div>
                </div>
            `).join('');
        }
        
        function clearFoodForm() {
            document.getElementById('customFoodName').value = '';
            document.getElementById('customFoodLocation').value = '';
            document.getElementById('customFoodHours').value = '';
            document.getElementById('customFoodDesc').value = '';
            document.getElementById('customFoodMapLink').value = '';
            document.getElementById('customFoodImage').value = '';
            document.getElementById('imagePreview').style.display = 'none';
        }
        
        renderCustomFoods();

        // ========== Geolocation ==========
        const landmarks = {
            hotel: { lat: 35.6966, lng: 139.8126, name: '東武黎凡特飯店' },
            asakusa: { lat: 35.7148, lng: 139.7967, name: '淺草寺' },
            skytree: { lat: 35.7101, lng: 139.8107, name: '晴空塔' },
            ueno: { lat: 35.7141, lng: 139.7774, name: '上野' },
            akiba: { lat: 35.6984, lng: 139.7731, name: '秋葉原' },
            tokyo: { lat: 35.6812, lng: 139.7671, name: '東京車站' },
            ginza: { lat: 35.6717, lng: 139.7649, name: '銀座' },
            shibuya: { lat: 35.6580, lng: 139.7016, name: '澀谷' },
            shinjuku: { lat: 35.6896, lng: 139.7006, name: '新宿' }
        };

        function getDistance(lat1, lng1, lat2, lng2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }

        function showNearbyLandmarks() {
            if (!navigator.geolocation) {
                showToast('您的瀏覽器不支援地理位置功能');
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    const distances = Object.entries(landmarks).map(([key, lm]) => ({
                        key,
                        ...lm,
                        distance: getDistance(latitude, longitude, lm.lat, lm.lng)
                    })).sort((a, b) => a.distance - b.distance);

                    const nearest = distances.slice(0, 3);
                    const msg = `📍 您附近：${nearest.map(d => `${d.name} (${d.distance.toFixed(1)}km)`).join('、')}`;
                    showToast(msg);
                },
                (error) => {
                    showToast('無法取得您的位置，請檢查定位權限');
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        }

        // ========== Customizable Itinerary ==========
        const defaultItinerary = {
            day1: {
                title: '🛬 Day 1 - 抵達東京',
                date: '9/1 (二)',
                activities: [
                    { time: '12:55', name: '抵達成田機場', desc: '辦理入境手續、領取行李', tag: '交通' },
                    { time: '14:30', name: '前往飯店', desc: '搭建成田特快 → 錦系町站', tag: '交通' },
                    { time: '16:00', name: '飯店 Check-in', desc: '東武黎凡特飯店', tag: '' },
                    { time: '16:30', name: '淺草寺・雷門', desc: '東京最古老的寺廟', tag: '景點' },
                    { time: '18:30', name: '晴空塔', desc: '欣賞夜景', tag: '景點' },
                    { time: '20:00', name: '晚餐', desc: '淺草老字號天婦羅', tag: '美食' },
                    { time: '21:30', name: '回飯店休息', desc: '享受大浴場', tag: '' }
                ]
            },
            day2: {
                title: '⛩️ Day 2 - 澀谷・新宿',
                date: '9/2 (三)',
                activities: [
                    { time: '08:00', name: '飯店早餐', desc: '享用日式早餐', tag: '美食' },
                    { time: '09:30', name: '明治神宮', desc: '東京最大的神社', tag: '景點' },
                    { time: '11:30', name: '原宿竹下通', desc: '年輕人潮流聖地', tag: '購物' },
                    { time: '13:00', name: '午餐：拉麵', desc: '一蘭拉麵', tag: '美食' },
                    { time: '14:30', name: '澀谷 Scramble Square', desc: 'Sky 展望台', tag: '景點' },
                    { time: '17:00', name: '新宿御苑', desc: '欣賞日式庭園', tag: '景點' },
                    { time: '19:00', name: '晚餐：思出橫丁', desc: '串燒與關東煮', tag: '美食' }
                ]
            },
            day3: {
                title: '🏰 Day 3 - 秋葉原・東京車站',
                date: '9/3 (四)',
                activities: [
                    { time: '08:00', name: '飯店早餐', desc: '享用日式早餐', tag: '美食' },
                    { time: '09:30', name: '秋葉原電氣街', desc: '動漫、電器', tag: '購物' },
                    { time: '12:00', name: '午餐', desc: '秋葉原女僕咖啡廳', tag: '美食' },
                    { time: '14:00', name: '東京車站一番街', desc: '地下街購物', tag: '購物' },
                    { time: '15:30', name: '皇居外苑', desc: '二重橋散步', tag: '景點' },
                    { time: '17:00', name: '銀座逛街', desc: '東京最高級商店街', tag: '購物' },
                    { time: '19:00', name: '晚餐：銀座壽司', desc: '新鮮握壽司', tag: '美食' }
                ]
            },
            day4: {
                title: '🌊 Day 4 - 台場・豐洲',
                date: '9/4 (五)',
                activities: [
                    { time: '08:00', name: '飯店早餐', desc: '享用日式早餐', tag: '美食' },
                    { time: '09:30', name: '豐洲市場', desc: '新鮮海鮮早餐', tag: '美食' },
                    { time: '11:30', name: '台場海濱公園', desc: '自由女神、彩虹大橋', tag: '景點' },
                    { time: '14:30', name: 'DiverCity', desc: '1:1 鋼彈模型', tag: '景點' },
                    { time: '16:30', name: 'teamLab Borderless', desc: '沉浸式數位藝術', tag: '景點' },
                    { time: '19:00', name: '晚餐：燒肉', desc: '欣賞夜景', tag: '美食' },
                    { time: '21:00', name: '台場夜景', desc: '摩天輪', tag: '景點' }
                ]
            },
            day5: {
                title: '🌸 Day 5 - 下北澤・吉祥寺',
                date: '9/5 (六)',
                activities: [
                    { time: '08:00', name: '飯店早餐', desc: '享用日式早餐', tag: '美食' },
                    { time: '09:30', name: '下北澤古著街', desc: '二手服飾', tag: '購物' },
                    { time: '12:00', name: '午餐：咖哩', desc: '日式咖哩名店', tag: '美食' },
                    { time: '13:30', name: '吉祥寺井之頭公園', desc: '划船、散步', tag: '景點' },
                    { time: '16:30', name: '吉卜力美術館', desc: '宮崎駿動畫迷必訪', tag: '景點' },
                    { time: '19:00', name: '晚餐：迴轉壽司', desc: '最後一晚的壽司', tag: '美食' },
                    { time: '21:00', name: '飯店收拾行李', desc: '準備明天回程', tag: '' }
                ]
            },
            day6: {
                title: '🛫 Day 6 - 回家',
                date: '9/6 (日)',
                activities: [
                    { time: '08:00', name: '飯店早餐', desc: '最後一頓日式早餐', tag: '美食' },
                    { time: '09:30', name: '上野阿美橫丁', desc: '採購伴手禮', tag: '購物' },
                    { time: '12:00', name: '午餐', desc: '上野周邊用餐', tag: '美食' },
                    { time: '14:00', name: '飯店 Check-out', desc: '寄放行李', tag: '' },
                    { time: '16:00', name: '前往成田機場', desc: 'JR總武線', tag: '交通' },
                    { time: '20:40', name: '登機 JX805', desc: '返回台北', tag: '交通' }
                ]
            }
        };

        let itinerary;
        try {
            const saved = localStorage.getItem('tokyoItinerary');
            itinerary = saved ? JSON.parse(saved) : null;
        } catch(e) {
            itinerary = null;
        }
        if (!itinerary || !itinerary.day1) itinerary = JSON.parse(JSON.stringify(defaultItinerary));

        function getTagClass(tag) {
            const map = { '美食': 'tag-food', '景點': 'tag-spot', '交通': 'tag-train', '購物': 'tag-shopping', '寺廟': 'tag-temple' };
            return map[tag] || '';
        }

        function renderItinerary() {
            const container = document.getElementById('itineraryContainer');
            if (!container) { console.error('itineraryContainer not found'); return; }
            const gradients = ['var(--gradient)', 'var(--gradient-secondary)', 'var(--gradient)', 'var(--gradient-secondary)', 'var(--gradient)', 'var(--gradient-secondary)'];
            
            try {
            container.innerHTML = Object.entries(itinerary).map(([day, data], i) => `
                <div class="tab-content ${i === 0 ? 'active' : ''}" id="${day}">
                    <div class="day-header" style="background: ${gradients[i]};" role="button" tabindex="0" onclick="toggleDay(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleDay(this);}" aria-expanded="false">
                        <h3>${data.title}</h3>
                        <span class="date">${data.date} <i class="fas fa-chevron-down"></i></span>
                    </div>
                    <div class="day-content">
                        ${(data.activities || []).map((act, j) => `
                            <div class="activity" style="position:relative;">
                                <div class="activity-time">${act.time}</div>
                                <div class="activity-info" style="flex:1;">
                                    <h4>${act.name}</h4>
                                    <p>${act.desc || ''}</p>
                                    ${act.tag ? `<span class="activity-tag ${getTagClass(act.tag)}">${act.tag}</span>` : ''}
                                </div>
                                <div style="display:flex; gap:4px; position:absolute; top:8px; right:0;">
                                    <button onclick="editActivity('${day}', ${j})" style="background:none; border:none; cursor:pointer; font-size:0.8rem; color:var(--text-light); padding:4px;" title="編輯">✏️</button>
                                    <button onclick="deleteActivity('${day}', ${j})" style="background:none; border:none; cursor:pointer; font-size:0.8rem; color:var(--text-light); padding:4px;" title="刪除">✕</button>
                                </div>
                            </div>
                        `).join('')}
                        <button onclick="addActivity('${day}')" style="width:100%; padding:0.8rem; margin-top:0.5rem; background:var(--bg); border:2px dashed var(--border-color); border-radius:10px; cursor:pointer; font-size:0.9rem; color:var(--text-light); transition:all 0.3s;">
                            ➕ 新增活動
                        </button>
                    </div>
                </div>
            `).join('');
            } catch(e) { console.error('renderItinerary inner error:', e); }
            
            // Auto-expand first day
            setTimeout(() => {
                const firstContent = document.querySelector('#day1 .day-content');
                if (firstContent) firstContent.classList.add('expanded');
            }, 100);
        }

        // ========== Activity Modal ==========
        let selectedTag = '';

        function selectTag(btn, tag) {
            selectedTag = tag;
            document.getElementById('modalTag').value = tag;
            document.querySelectorAll('#activityModal .tag-btn-selected, #activityModal [style*="border-radius:15px"]').forEach(b => {
                b.style.borderColor = 'var(--border-color)';
                b.style.background = 'var(--bg)';
                b.classList.remove('tag-btn-selected');
            });
            btn.style.borderColor = 'var(--primary)';
            btn.style.background = 'var(--primary)';
            btn.style.color = 'white';
            btn.classList.add('tag-btn-selected');
        }

        function openModal(day, index) {
            const modal = document.getElementById('activityModal');
            const title = document.getElementById('modalTitle');
            document.getElementById('modalDay').value = day;
            document.getElementById('modalIndex').value = index;
            
            if (index >= 0) {
                const act = itinerary[day].activities[index];
                title.textContent = '編輯活動';
                document.getElementById('modalTime').value = act.time;
                document.getElementById('modalName').value = act.name;
                document.getElementById('modalDesc').value = act.desc;
                selectTagByValue(act.tag);
            } else {
                title.textContent = '新增活動';
                document.getElementById('modalTime').value = '';
                document.getElementById('modalName').value = '';
                document.getElementById('modalDesc').value = '';
                selectTagByValue('');
            }
            
            modal.style.display = 'flex';
        }

        function closeModal() {
            document.getElementById('activityModal').style.display = 'none';
        }

        function selectTagByValue(tag) {
            selectedTag = tag;
            document.getElementById('modalTag').value = tag;
            const buttons = document.querySelectorAll('#activityModal [onclick^="selectTag"]');
            buttons.forEach(btn => {
                const btnTag = btn.getAttribute('onclick').match(/'([^']*)'/)[1];
                if (btnTag === tag) {
                    btn.style.borderColor = 'var(--primary)';
                    btn.style.background = 'var(--primary)';
                    btn.style.color = 'white';
                } else {
                    btn.style.borderColor = 'var(--border-color)';
                    btn.style.background = 'var(--bg)';
                    btn.style.color = 'var(--text)';
                }
            });
        }

        function saveActivity() {
            const day = document.getElementById('modalDay').value;
            const index = parseInt(document.getElementById('modalIndex').value);
            const time = document.getElementById('modalTime').value;
            const name = document.getElementById('modalName').value.trim();
            const desc = document.getElementById('modalDesc').value.trim();
            const tag = document.getElementById('modalTag').value;

            if (!time || !name) {
                showToast('請填寫時間和活動名稱');
                return;
            }

            if (index >= 0) {
                itinerary[day].activities[index] = { time, name, desc, tag };
            } else {
                itinerary[day].activities.push({ time, name, desc, tag });
            }

            itinerary[day].activities.sort((a, b) => a.time.localeCompare(b.time));
            localStorage.setItem('tokyoItinerary', JSON.stringify(itinerary));
            renderItinerary();
            closeModal();
            showToast(index >= 0 ? '已更新活動' : '已新增活動');
        }

        function addActivity(day) {
            openModal(day, -1);
        }

        function editActivity(day, index) {
            openModal(day, index);
        }

        function deleteActivity(day, index) {
            if (!confirm('確定要刪除此活動嗎？')) return;
            itinerary[day].activities.splice(index, 1);
            localStorage.setItem('tokyoItinerary', JSON.stringify(itinerary));
            renderItinerary();
            showToast('已刪除活動');
        }

        let allExpanded = false;
        function toggleAllDays() {
            allExpanded = !allExpanded;
            document.querySelectorAll('.day-content').forEach(el => {
                if (allExpanded) {
                    el.classList.add('expanded');
                } else {
                    el.classList.remove('expanded');
                }
            });
            document.querySelectorAll('.day-header .fa-chevron-down').forEach(icon => {
                icon.style.transform = allExpanded ? 'rotate(180deg)' : 'rotate(0)';
            });
            const btn = document.querySelector('[onclick="toggleAllDays()"]');
            if (btn) btn.textContent = allExpanded ? '📖 全部收合' : '📖 全部展開';
        }

        function resetItinerary() {
            if (!confirm('確定要重置行程嗎？所有自訂內容將被清除。')) return;
            itinerary = JSON.parse(JSON.stringify(defaultItinerary));
            localStorage.setItem('tokyoItinerary', JSON.stringify(itinerary));
            renderItinerary();
            showToast('行程已重置');
        }

        // Render itinerary on load
        try {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', renderItinerary);
            } else {
                renderItinerary();
            }
        } catch(e) { console.error('renderItinerary call error:', e); }

        // ========== Today's Itinerary ==========
        function goToToday() {
            const tripStart = new Date('2026-09-01');
            const today = new Date();
            const diffDays = Math.floor((today - tripStart) / (1000 * 60 * 60 * 24));
            
            let dayNum = 1;
            if (diffDays >= 0 && diffDays < 6) {
                dayNum = diffDays + 1;
            } else if (diffDays >= 6) {
                dayNum = 6;
            }
            
            const tabId = 'day' + dayNum;
            const tabBtn = document.querySelector(`.tab-btn:nth-child(${dayNum})`);
            if (tabBtn) showTab(tabId, tabBtn);
            
            document.getElementById('itinerary').scrollIntoView({ behavior: 'smooth' });
            
            setTimeout(() => {
                const dayContent = document.querySelector(`#${tabId} .day-content`);
                if (dayContent && !dayContent.classList.contains('expanded')) {
                    toggleDay(document.querySelector(`#${tabId} .day-header`));
                }
            }, 500);
        }

        // ========== Initialize ==========
        try { loadChecklist(); } catch(e) { console.error('loadChecklist error:', e); }

        // Loading screen - ALWAYS hide after 2 seconds
        function hideLoading() {
            const ls = document.getElementById('loadingScreen');
            if (ls) ls.classList.add('hidden');
        }
        setTimeout(hideLoading, 2000);
        window.addEventListener('load', () => { setTimeout(hideLoading, 500); });

        // Scroll Reveal with IntersectionObserver
        function initScrollReveal() {
            const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
            if (!reveals.length) return;
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
            reveals.forEach(el => observer.observe(el));
        }

        // Add reveal classes to sections
        document.querySelectorAll('.section-title').forEach(el => el.classList.add('reveal'));
        document.querySelectorAll('.flight-card').forEach((el, i) => {
            el.classList.add('reveal-scale');
            el.style.transitionDelay = `${i * 0.15}s`;
        });
        document.querySelectorAll('.food-card').forEach((el, i) => {
            el.classList.add('reveal');
            el.style.transitionDelay = `${i * 0.1}s`;
        });
        document.querySelectorAll('.tip-card').forEach((el, i) => {
            el.classList.add('reveal-left');
            el.style.transitionDelay = `${i * 0.1}s`;
        });
        document.querySelectorAll('.transport-card').forEach((el, i) => {
            el.classList.add('reveal');
            el.style.transitionDelay = `${i * 0.12}s`;
        });
        document.querySelectorAll('.emergency-card').forEach((el, i) => {
            el.classList.add('reveal-scale');
            el.style.transitionDelay = `${i * 0.08}s`;
        });
        document.querySelectorAll('.hotel-card').forEach(el => el.classList.add('reveal'));
        document.querySelectorAll('.converter-box, .weather-widget, .checklist, .budget-tracker').forEach(el => el.classList.add('reveal'));
        document.querySelectorAll('.transfer-card').forEach((el, i) => {
            el.classList.add('reveal');
            el.style.transitionDelay = `${i * 0.15}s`;
        });
        document.querySelectorAll('.metro-line').forEach((el, i) => {
            el.classList.add('reveal-left');
            el.style.transitionDelay = `${i * 0.12}s`;
        });
        document.querySelectorAll('.routemap-container > div:last-child').forEach(el => el.classList.add('reveal'));
        document.querySelectorAll('.map-container').forEach(el => el.classList.add('reveal'));

        try { initScrollReveal(); } catch(e) { console.error('scrollReveal error:', e); }

        try { document.querySelectorAll('.marker[role="button"]').forEach(m => { m.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); m.dispatchEvent(new Event('click')); } }); }); } catch(e) {}

        // === Web Share API ===
        function nativeShare() {
            if (navigator.share) {
                navigator.share({
                    title: document.title,
                    text: '跟我一起看看東京六天五夜行程規劃！🗼',
                    url: window.location.href
                }).catch(() => {});
            }
        }
        if (navigator.share) {
            const nsBtn = document.getElementById('nativeShareBtn');
            if (nsBtn) nsBtn.style.display = 'inline-flex';
        }
        function safeGetItem(key, fallback) {
            try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
            catch(e) { return fallback; }
        }
        function safeSetItem(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); }
            catch(e) { console.warn('localStorage save failed:', e); }
        }
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch(() => {});
            });
        }
        
        // Show welcome toast
        setTimeout(() => showToast('歡迎使用東京自由行網站！'), 2500);

        // ========== Offline Detection ==========
        function updateOnlineStatus() {
            if (!navigator.onLine) {
                showToast('📡 目前處於離線模式，部分功能受限');
            }
        }
        window.addEventListener('online', () => showToast('✅ 已恢復網路連線'));
        window.addEventListener('offline', updateOnlineStatus);
        if (!navigator.onLine) updateOnlineStatus();

        // ========== PWA Install Prompt ==========
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            // Show install prompt after 5 seconds
            setTimeout(() => {
                if (deferredPrompt) {
                    showToast('📱 點擊選單可安裝此應用到主螢幕');
                }
            }, 5000);
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            showToast('✅ 已成功安裝到主螢幕！');
        });
    