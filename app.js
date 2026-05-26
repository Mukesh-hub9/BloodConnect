const app = {
    state: {
        map: null,
        markerLayer: null,
        requestLayer: null,
        userLocation: null,
        donors: [],
        requests: [],
        notifications: [],
        liveActivity: [],
        profileView: 'history',
        offlineMode: false,
        currentUser: null, // can be 'admin' or 'hospital' when logged in
        donationHistory: []
    },

    init() {
        this.seedLocalStorage();
        this.initTheme();
        this.initNotifications();
        this.loadDonors();
        this.loadRequests();
        this.renderDonationHistory();
        this.renderNotifications();
        this.renderProfileSummary();
        this.renderProfileActivityFeed();
        this.initCounters();
        this.scheduleLiveUpdates();
        this.initScrollReveal();
    },

    initTheme() {
        const savedTheme = localStorage.getItem('bc_theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        this.updateThemeToggleIcon();
    },

    updateThemeToggleIcon() {
        const btn = document.getElementById('btnThemeToggle');
        if (!btn) return;
        btn.innerHTML = document.body.classList.contains('dark-mode') ? '<i class="ph ph-sun"></i>' : '<i class="ph ph-moon"></i>';
    },


    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        overlay.querySelector('p').innerText = message;
    },

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (!overlay) return;
        overlay.style.display = 'none';
    },

    updateLiveOnlineCount() {
        const count = (this.state.donors || []).filter(d => d.available).length;
        const el = document.getElementById('liveOnlineCount');
        if (el) el.innerText = count;
    },

    updateDashboardMetrics() {
        const availableDonors = (this.state.donors || []).filter(d => d.available).length;
        const totalDonors = (this.state.donors || []).length;
        const openRequests = (this.state.requests || []).filter(r => r.status === 'Open').length;
        const mapCount = totalDonors;

        const availEl = document.getElementById('quickAvailableCount');
        const urgentEl = document.getElementById('quickUrgentCount');
        const mapEl = document.getElementById('quickMapCount');

        if (availEl) availEl.innerText = availableDonors;
        if (urgentEl) urgentEl.innerText = openRequests;
        if (mapEl) mapEl.innerText = mapCount;
        this.updateLiveOnlineCount();
    },

    initNotifications() {
        const savedNotifications = JSON.parse(localStorage.getItem('bc_notifications')) || [];
        if (savedNotifications.length > 0) {
            this.state.notifications = savedNotifications;
        } else {
            this.state.notifications = [
                { id: 1, date: new Date(Date.now() - 3600000).toISOString(), title: 'New Donor Available', message: 'Kiran Kumar is available for O- Whole Blood in Rajahmundry.', type: 'success' },
                { id: 2, date: new Date(Date.now() - 7200000).toISOString(), title: 'Urgent Request Posted', message: 'GGH General Hospital needs A+ Platelets within 12 hours.', type: 'warning' },
                { id: 3, date: new Date(Date.now() - 10800000).toISOString(), title: 'Profile Milestone', message: 'You have saved 12 lives so far through the platform.', type: 'info' },
                { id: 4, date: new Date(Date.now() - 14400000).toISOString(), title: 'Match Found', message: 'A compatible O+ donor is now near City General Hospital.', type: 'success' },
                { id: 5, date: new Date(Date.now() - 18000000).toISOString(), title: 'Notification Setup', message: 'Your alert preferences are ready. You will receive urgent request updates.', type: 'info' }
            ];
            localStorage.setItem('bc_notifications', JSON.stringify(this.state.notifications));
        }
        this.renderNotifications();
        this.renderLiveActivityFeed();
    },

    addNotification(title, message, type = 'info') {
        const notification = {
            id: Date.now(),
            date: new Date().toISOString(),
            title,
            message,
            type
        };
        this.state.notifications.unshift(notification);
        this.state.notifications = this.state.notifications.slice(0, 12);
        localStorage.setItem('bc_notifications', JSON.stringify(this.state.notifications));
        this.renderNotifications();
        this.showToast(`${title} — ${message}`, type);
    },

    renderNotifications(containerId = 'profileNotificationFeed') {
        const feed = document.getElementById(containerId);
        if (!feed) return;
        if (!this.state.notifications.length) {
            feed.innerHTML = `<div class="empty-state"><strong>No notifications yet</strong><br>Action will appear here when donors or requests update.</div>`;
        } else {
            feed.innerHTML = this.state.notifications.slice(0, 6).map(notification => {
                const timestamp = new Date(notification.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="notification-item" style="padding:14px; border-bottom:1px solid rgba(255,255,255,0.08);">
                        <strong>${notification.title}</strong>
                        <p style="margin:6px 0 0; color:var(--text-muted); font-size:13px;">${notification.message}</p>
                        <span style="font-size:11px; color:var(--text-muted);">${timestamp}</span>
                    </div>
                `;
            }).join('');
        }
        this.updateNotificationBadge();
    },

    updateNotificationBadge() {
        const badge = document.getElementById('profileNotificationsBadge');
        if (!badge) return;
        const count = (this.state.notifications || []).length;
        if (count > 0) {
            badge.innerText = count;
            badge.classList.add('visible', 'pulse');
            setTimeout(() => badge.classList.remove('pulse'), 900);
        } else {
            badge.classList.remove('visible', 'pulse');
            badge.innerText = '0';
        }
    },

    renderLiveActivityFeed() {
        const feed = document.getElementById('liveActivityFeed');
        if (!feed) return;
        const historyEvents = this.getDonationHistory().map(item => ({
            date: item.date,
            title: item.title,
            message: item.details,
            category: 'history'
        }));
        const requestEvents = (this.state.requests || []).filter(r => r.status === 'Open').map(r => ({
            date: r.created_at,
            title: `Emergency request: ${r.blood_group}`,
            message: `${r.hospital_name} needs ${r.units} unit(s) of ${r.blood_group} ${r.component} in ${r.city}.`, 
            category: 'request'
        }));
        const combined = [...historyEvents, ...requestEvents].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
        if (!combined.length) {
            feed.innerHTML = `<div class="empty-state"><strong>No recent activity</strong><br>Any donor commits or urgent requests will show up here.</div>`;
            return;
        }
        feed.innerHTML = combined.map(activity => {
            const timestamp = new Date(activity.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return `
                <div class="activity-item" style="padding:14px; border-bottom:1px solid rgba(255,255,255,0.08);">
                    <strong>${activity.title}</strong>
                    <p style="margin:8px 0 0; color:var(--text-muted); font-size:13px;">${activity.message}</p>
                    <span style="font-size:11px; color:var(--text-muted);">${timestamp}</span>
                </div>
            `;
        }).join('');
    },

    scheduleLiveUpdates() {
        setInterval(() => {
            this.loadDonors();
            this.loadRequests();
            this.renderLiveActivityFeed();
            this.updateLiveInventory();
        }, 20000);
    },

    toggleChatAssistant() {
        const panel = document.getElementById('aiAssistantPanel');
        if (!panel) return;
        const isOpen = panel.classList.toggle('open');
        this.state.chatOpen = isOpen;
        if (isOpen) {
            const input = panel.querySelector('.ai-input');
            if (input) input.focus();
            if (!this.state.chatInitialized) {
                this.appendChatMessage('assistant', 'Hi! I can help you search donors, review urgent requests, or explain blood compatibility.');
                this.appendChatSuggestions(['Find O- donors near Rajahmundry', 'Show urgent requests', 'How does compatibility work?']);
                this.state.chatInitialized = true;
            }
        }
    },

    appendChatMessage(who, message) {
        const body = document.getElementById('aiChatBody');
        if (!body) return;
        const item = document.createElement('div');
        item.className = `ai-message ${who}`;
        item.innerHTML = `<div class="ai-message-text">${message}</div>`;
        body.appendChild(item);
        body.scrollTop = body.scrollHeight;
    },

    appendChatSuggestions(suggestions) {
        const row = document.getElementById('aiChatSuggestions');
        if (!row) return;
        row.innerHTML = '';
        suggestions.forEach(text => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-suggestion-chip';
            btn.innerText = text;
            btn.addEventListener('click', () => this.sendChatPrompt(text));
            row.appendChild(btn);
        });
    },

    sendChatPrompt(text) {
        const input = document.querySelector('#aiAssistantPanel .ai-input');
        if (!input) return;
        input.value = text;
        this.sendChatMessage();
    },

    sendChatMessage() {
        const input = document.querySelector('#aiAssistantPanel .ai-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        this.appendChatMessage('user', text);
        input.value = '';
        this.respondToChat(text);
    },

    respondToChat(text) {
        const lower = text.toLowerCase();
        const bloodGroups = ['o-', 'o+', 'a-', 'a+', 'b-', 'b+', 'ab-', 'ab+'];
        const bloodMatch = bloodGroups.find(group => lower.includes(group));
        const cityMatch = lower.match(/(?:near|in|at|for) ([a-z ]+)/);
        const knownCities = ['rajahmundry', 'hyderabad', 'vijayawada', 'chennai', 'mumbai', 'bangalore', 'delhi'];
        const city = cityMatch ? cityMatch[1].trim() : knownCities.find(c => lower.includes(c));

        if (/inventory|stock|available|live inventory/.test(lower)) {
            const totalDonors = this.state.donors.length;
            const availableCount = this.state.donors.filter(d => d.available).length;
            this.appendChatMessage('assistant', `There are currently ${availableCount} donors available out of ${totalDonors} registered. I can update the live inventory anytime.`);
            return;
        }

        if (/notify|notification|alerts/.test(lower)) {
            this.appendChatMessage('assistant', 'Opening your notification feed with the latest donor and request alerts.');
            document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        if (/map|live map|location|markers/.test(lower)) {
            this.appendChatMessage('assistant', 'Showing the live map with donor and hospital request markers.');
            this.showSection('results');
            this.toggleMap();
            return;
        }

        if (/history|donation history|profile|journey/.test(lower)) {
            this.appendChatMessage('assistant', 'Opening your donation profile and history timeline now.');
            this.showSection('profile');
            return;
        }

        if (/urgent|emergency|request/.test(lower)) {
            this.appendChatMessage('assistant', 'Opening the active emergency requests board for you.');
            this.showSection('urgent-requests');
            return;
        }

        if (bloodMatch && city) {
            const bloodValue = bloodMatch.toUpperCase();
            this.appendChatMessage('assistant', `Searching for ${bloodValue} donors in ${city}.`);
            const searchBlood = document.getElementById('searchBlood');
            const searchLocation = document.getElementById('searchLocation');
            if (searchBlood) searchBlood.value = bloodValue;
            if (searchLocation) searchLocation.value = city;
            const compatibility = /compatible|smart/.test(lower);
            const chk = document.getElementById('chkCompatibility');
            if (chk) chk.checked = compatibility;
            this.showSection('request');
            this.initiateSearch();
            return;
        }

        if (bloodMatch && !city) {
            this.appendChatMessage('assistant', 'I found a blood group, but please tell me a city or location too.');
            return;
        }

        if (city && !bloodMatch) {
            this.appendChatMessage('assistant', 'I found the location. Please specify which blood group you need.');
            return;
        }

        if (/compatibility|compatible/.test(lower)) {
            this.appendChatMessage('assistant', 'Compatible donors are those whose blood type can safely donate to the requested type. Use Smart Compatibility to include compatible matches from nearby donors.');
            return;
        }

        this.appendChatMessage('assistant', 'I can help you search for donors, open urgent requests, or show your profile history. Try “Find A+ donors near Hyderabad” or “Show live inventory”.');
    },

    seedLocalStorage() {
        if (!localStorage.getItem('bc_donors')) {
            const initialDonors = [
                { id: 1, name: "Kiran Kumar", age: 28, weight: 66, blood_group: "O-", component: "Whole Blood", city: "Rajahmundry", phone: "+91 94405 12345", available: true, lat: 17.0075, lng: 81.7950, last_donation_date: "2026-03-10" },
                { id: 2, name: "Srinivas Rao", age: 35, weight: 75, blood_group: "A+", component: "Platelets", city: "Rajahmundry", phone: "+91 98480 67890", available: true, lat: 16.9930, lng: 81.8150, last_donation_date: "2026-05-01" },
                { id: 3, name: "Dr. Lakshmi Priya", age: 31, weight: 57, blood_group: "O+", component: "Plasma", city: "Rajahmundry", phone: "+91 80081 23456", available: true, lat: 17.0120, lng: 81.8080, last_donation_date: "2026-04-15" },
                { id: 4, name: "Ravi Teja", age: 24, weight: 68, blood_group: "B+", component: "Whole Blood", city: "Rajahmundry", phone: "+91 99899 55443", available: true, lat: 16.9850, lng: 81.7820, last_donation_date: "2026-02-28" },
                { id: 5, name: "Ananya Sharma", age: 29, weight: 60, blood_group: "AB+", component: "Platelets", city: "Rajahmundry", phone: "+91 77022 11223", available: true, lat: 17.0250, lng: 81.8200, last_donation_date: "2026-05-10" },
                { id: 6, name: "Manish Patel", age: 42, weight: 82, blood_group: "B-", component: "Whole Blood", city: "Hyderabad", phone: "+91 98662 33445", available: false, lat: 17.3850, lng: 78.4867, last_donation_date: "2026-01-05" },
                { id: 7, name: "Meera Nair", age: 34, weight: 58, blood_group: "A-", component: "Plasma", city: "Vijayawada", phone: "+91 95661 22334", available: true, lat: 16.5062, lng: 80.6480, last_donation_date: "2026-04-08" },
                { id: 8, name: "Pradeep Singh", age: 50, weight: 77, blood_group: "O+", component: "Whole Blood", city: "Rajahmundry", phone: "+91 92468 55678", available: true, lat: 17.0035, lng: 81.8086, last_donation_date: "2025-12-30" },
                { id: 9, name: "Sunita Reddy", age: 26, weight: 62, blood_group: "AB-", component: "Platelets", city: "Rajahmundry", phone: "+91 97000 22334", available: true, lat: 17.0110, lng: 81.7840, last_donation_date: "2026-05-20" },
                { id: 10, name: "Arjun Varma", age: 38, weight: 84, blood_group: "O-", component: "Plasma", city: "Hyderabad", phone: "+91 99874 55660", available: false, lat: 17.4310, lng: 78.4430, last_donation_date: "2026-03-27" }
            ];
            localStorage.setItem('bc_donors', JSON.stringify(initialDonors));
        }

        if (!localStorage.getItem('bc_requests')) {
            const initialRequests = [
                { id: 1, patient_name: "Subba Rao", hospital_name: "City General Hospital", blood_group: "O-", component: "Whole Blood", urgency: "Critical", city: "Rajahmundry", address: "Danavaipeta Rd, Near Bus Stand", phone: "+91 91234 56789", lat: 17.0090, lng: 81.7920, status: "Open", units: 2, scenario_description: "Multiple trauma victims from a bus accident need immediate O- support.", created_at: new Date(Date.now() - 3600000).toISOString() },
                { id: 2, patient_name: "Baby of Lakshmi", hospital_name: "GGH General Hospital", blood_group: "A+", component: "Platelets", urgency: "Urgent", city: "Rajahmundry", address: "Innespeta Main Road", phone: "+91 98888 77777", lat: 16.9980, lng: 81.8020, status: "Open", units: 1, scenario_description: "Young patient undergoing chemotherapy requires platelet transfusion.", created_at: new Date(Date.now() - 7200000).toISOString() },
                { id: 3, patient_name: "Mrs. Kavitha", hospital_name: "Sri Ram Hospital", blood_group: "B+", component: "Whole Blood", urgency: "Urgent", city: "Rajahmundry", address: "NSS Road, Near Hospital Junction", phone: "+91 94477 12321", lat: 17.0155, lng: 81.8055, status: "Open", units: 3, scenario_description: "Emergency surgery for postpartum hemorrhage demands fresh B+ units.", created_at: new Date(Date.now() - 10800000).toISOString() },
                { id: 4, patient_name: "Mr. Ramesh", hospital_name: "Apollo City Care", blood_group: "AB+", component: "Plasma", urgency: "Normal", city: "Hyderabad", address: "Gachibowli Flyover, Hitech City", phone: "+91 90123 45678", lat: 17.4400, lng: 78.3910, status: "Open", units: 2, scenario_description: "Support for a liver transplant patient needing AB+ plasma units within 24 hours.", created_at: new Date(Date.now() - 14400000).toISOString() },
                { id: 5, patient_name: "Child of Rekha", hospital_name: "Rainbow Children Hospital", blood_group: "O+", component: "Whole Blood", urgency: "Critical", city: "Vijayawada", address: "HB Colony Road, Near Water Tank", phone: "+91 97011 33445", lat: 16.5100, lng: 80.6430, status: "Open", units: 2, scenario_description: "Pediatric emergency requiring O+ blood for a child with severe anemia.", created_at: new Date(Date.now() - 18000000).toISOString() }
            ];
            localStorage.setItem('bc_requests', JSON.stringify(initialRequests));
        }

        if (!localStorage.getItem('bc_history')) {
            const initialHistory = [
                {
                    type: 'Registration',
                    date: new Date(Date.now() - 604800000).toISOString(),
                    title: 'Joined BloodConnect',
                    details: 'Completed profile registration and consent for urgent donation alerts.'
                },
                {
                    type: 'Fulfilled Request',
                    date: new Date(Date.now() - 432000000).toISOString(),
                    title: 'Responded to urgent O- request',
                    details: 'Donated 2 units of O- at City General Hospital after a traffic accident broadcast.'
                },
                {
                    type: 'Fulfilled Request',
                    date: new Date(Date.now() - 259200000).toISOString(),
                    title: 'Platelet support for chemotherapy patient',
                    details: 'Matched with a hospital request and helped deliver platelet units within 6 hours.'
                },
                {
                    type: 'Registration',
                    date: new Date(Date.now() - 172800000).toISOString(),
                    title: 'Verified donation eligibility',
                    details: 'Passed pre-screening and updated health summary for future donations.'
                }
            ];
            localStorage.setItem('bc_history', JSON.stringify(initialHistory));
        }
    },

    initScrollReveal() {
        const reveals = document.querySelectorAll('.reveal');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active-reveal');
                }
            });
        }, { threshold: 0.1 });
        
        reveals.forEach(r => observer.observe(r));
    },

    async loadDonors() {
        try {
            const response = await fetch('/api/donors');
            const data = await response.json();
            this.state.donors = data.donors || [];
            this.state.offlineMode = false;
        } catch (error) {
            console.warn('Backend server offline. Falling back to LocalStorage Database Mode.');
            this.state.donors = JSON.parse(localStorage.getItem('bc_donors')) || [];
            this.state.offlineMode = true;
        }
        this.updateLiveInventory();
        this.updateDashboardMetrics();
        this.renderLiveActivityFeed();
        if (this.state.map) {
            this.loadDonorsOnMap(this.state.donors);
        }
    },

    async loadRequests() {
        try {
            if (this.state.offlineMode) throw new Error("Offline Mode active");
            const response = await fetch('/api/requests');
            const data = await response.json();
            this.state.requests = data.requests || [];
        } catch (error) {
            this.state.requests = JSON.parse(localStorage.getItem('bc_requests')) || [];
        }
        this.renderRequestBoard();
        this.updateDashboardMetrics();
        this.renderLiveActivityFeed();
        if (this.state.map) {
            this.loadDonorsOnMap(this.state.donors);
        }
    },

    updateLiveInventory() {
        const inventoryGrid = document.getElementById('liveInventoryGrid');
        if (!inventoryGrid) return;
        
        const groups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
        const previousCounts = this.state.inventoryCounts || {};
        const stockMap = {};
        
        groups.forEach(g => {
            stockMap[g] = this.state.donors.filter(d => d.blood_group === g && d.available).length;
        });

        inventoryGrid.innerHTML = groups.map(g => {
            const count = stockMap[g] || 0;
            let status = 'Healthy';
            let stateClass = 'healthy';

            if (count <= 1) {
                status = 'Critical';
                stateClass = 'critical';
            } else if (count <= 3) {
                status = 'Low Stock';
                stateClass = 'low-stock';
            } else if (count <= 7) {
                status = 'Stable';
                stateClass = 'stable';
            }

            return `
                <div class="inventory-card glass ${stateClass}" data-group="${g}">
                    <div class="inventory-group">
                        <span class="inventory-type">${g}</span>
                        <span class="inventory-status">${status}</span>
                    </div>
                    <div class="inventory-units" data-count="${count}">${count} units</div>
                </div>
            `;
        }).join('');

        this.state.inventoryCounts = { ...stockMap };

        groups.forEach(g => {
            const oldCount = previousCounts[g] || 0;
            const newCount = stockMap[g] || 0;
            if (oldCount !== newCount) {
                const countEl = inventoryGrid.querySelector(`.inventory-card[data-group="${g}"] .inventory-units`);
                if (countEl) {
                    countEl.classList.add('pulse-count');
                    setTimeout(() => countEl.classList.remove('pulse-count'), 900);
                }
            }
        });
    },

    showSection(id) {
        const current = document.querySelector('.section.active');
        const target = document.getElementById(id);
        if (!target || target === current) return;

        if (current) {
            current.classList.remove('fade-in');
            current.classList.add('fade-out');
        }

        setTimeout(() => {
            if (current) {
                current.classList.remove('active', 'fade-out');
            }
            target.classList.add('active', 'fade-in');
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, current ? 220 : 0);

        // Auto-refresh lists when entering respective sections
        if (id === 'urgent-requests') {
            this.loadRequests();
        } else if (id === 'admin' && this.state.currentUser) {
            this.loadAdminData();
        } else if (id === 'profile') {
            this.renderDonationHistory();
            this.renderNotifications();
            this.renderProfileSummary();
            this.setProfileView(this.state.profileView, { openPopup: false });
        }
    },

    toggleDarkMode() {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('bc_theme', isDark ? 'dark' : 'light');
        this.updateThemeToggleIcon();
    },

    initCounters() {
        const counters = document.querySelectorAll('.counter');
        counters.forEach(counter => {
            const update = () => {
                const target = +counter.getAttribute('data-target');
                const c = +counter.innerText;
                const inc = target / 200;
                if (c < target) {
                    counter.innerText = Math.ceil(c + inc);
                    setTimeout(update, 10);
                } else {
                    counter.innerText = target;
                }
            };
            update();
        });
    },

    nextWizardStep(currentStep) {
        if (currentStep === 1) {
            const name = document.getElementById("donorName").value.trim();
            const age = document.getElementById("donorAge").value;
            const weight = document.getElementById("donorWeight").value;
            if (!name || !age || !weight) {
                this.showToast("Please fill all required fields in Step 1", "error");
                return;
            }
        }
        if (currentStep === 2) {
            const comp = document.getElementById("donorComponent").value;
            const blood = document.getElementById("donorBlood").value;
            const c1 = document.getElementById("chkHealth").checked;
            const c2 = document.getElementById("chkTattoo").checked;
            if (!comp || !blood || !c1 || !c2) {
                this.showToast("Please complete the medical screening in Step 2", "error");
                return;
            }
        }

        document.getElementById(`step${currentStep}`).classList.remove('active');
        document.getElementById(`step${currentStep + 1}`).classList.add('active');
        
        document.getElementById(`pstep${currentStep + 1}`).classList.add('active');
        const lines = document.querySelectorAll('.progress-line');
        if (lines[currentStep - 1]) lines[currentStep - 1].classList.add('active');
    },

    prevWizardStep(currentStep) {
        document.getElementById(`step${currentStep}`).classList.remove('active');
        document.getElementById(`step${currentStep - 1}`).classList.add('active');
        
        document.getElementById(`pstep${currentStep}`).classList.remove('active');
        const lines = document.querySelectorAll('.progress-line');
        if (lines[currentStep - 2]) lines[currentStep - 2].classList.remove('active');
    },

    registerDonor() {
        const name = document.getElementById("donorName").value.trim();
        const age = document.getElementById("donorAge").value.trim();
        const weight = document.getElementById("donorWeight").value.trim();
        const component = document.getElementById("donorComponent").value;
        const blood = document.getElementById("donorBlood").value;
        const city = document.getElementById("donorCity").value.trim();
        const phone = document.getElementById("donorPhone").value.trim();
        const availability = document.getElementById("donorAvailability").value === "true";

        if (!name || !age || !weight || !blood || !city || !phone) {
            this.showToast("Please fill all required fields.", "error");
            return;
        }

        this.showToast("Locating you...", "info");

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const newDonor = {
                        name,
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        phone,
                        blood_group: blood,
                        component,
                        city,
                        available: availability,
                        last_donation_date: new Date().toISOString().split("T")[0],
                        age: parseInt(age),
                        weight: parseInt(weight)
                    };

                    try {
                        let registered = false;
                        if (!app.state.offlineMode) {
                            try {
                                const response = await fetch('/api/donors', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(newDonor)
                                });
                                if (response.ok) registered = true;
                            } catch (e) {
                                console.warn("Fetch failed, falling back to local database storage direct write.");
                            }
                        }

                        if (!registered) {
                            const localDonors = JSON.parse(localStorage.getItem('bc_donors')) || [];
                            newDonor.id = Date.now();
                            localDonors.push(newDonor);
                            localStorage.setItem('bc_donors', JSON.stringify(localDonors));
                            this.state.donors = localDonors;
                            this.updateLiveInventory();
                        }

                        // Cooldown logic
                        let cooldown = 56;
                        if (component === 'Platelets') cooldown = 7;
                        if (component === 'Plasma') cooldown = 28;

                        const profileBox = document.getElementById('profileEligibility');
                        if (profileBox) {
                            profileBox.style.display = 'block';
                            profileBox.innerHTML = `
                                <h4>Next Eligibility</h4>
                                <p><strong>${component}:</strong> <span class="text-orange">In ${cooldown} Days</span> (Cooldown active)</p>
                            `;
                        }

                        const journeyBadge = document.getElementById('journeyComponentBadge');
                        if (journeyBadge) {
                            journeyBadge.innerText = `${component} • ID: #${Math.floor(Math.random() * 9000) + 1000}`;
                        }

                        // Set journey stepper to "Donated" stage
                        const steps = document.querySelectorAll('.stepper-container .step');
                        if (steps.length > 0) {
                            steps.forEach((s, idx) => {
                                s.classList.remove('completed', 'active-step');
                                if (idx === 0) s.classList.add('completed');
                                if (idx === 1) s.classList.add('active-step');
                            });
                            const stepLines = document.querySelectorAll('.stepper-container .step-line');
                            stepLines.forEach((l, idx) => {
                                l.classList.remove('active');
                                if (idx === 0) l.classList.add('active');
                            });
                        }

                        // Increment Donor count widget dynamically
                        const donorCounter = document.querySelector('.stats-container .stat-card:nth-child(1) h2');
                        if (donorCounter) {
                            donorCounter.innerText = parseInt(donorCounter.innerText) + 1;
                        }

                        document.getElementById("donorForm").reset();
                        
                        // Reset Wizard UI
                        [1, 2, 3].forEach(s => {
                            const step = document.getElementById(`step${s}`);
                            if (step) step.classList.remove('active');
                            const pstep = document.getElementById(`pstep${s}`);
                            if (pstep) pstep.classList.remove('active');
                        });
                        document.getElementById('step1').classList.add('active');
                        document.getElementById('pstep1').classList.add('active');
                        document.querySelectorAll('.progress-line').forEach(l => l.classList.remove('active'));

                        this.saveDonationHistory({
                            type: 'Registration',
                            date: new Date().toISOString(),
                            title: `Registered as ${blood} donor`,
                            details: `${component} donation option selected in ${city}.`
                        });
                        this.renderDonationHistory();
                        this.addNotification('New donor registered', `${name} is now available for ${blood} donations in ${city}.`, 'success');
                        this.showToast(`Registered successfully for ${component}. Next eligible in ${cooldown} days.`, "success");
                        this.showSection("profile");
                        this.loadDonors(); // refresh global state
                    } catch (err) {
                        this.showToast("Failed to save to database.", "error");
                    }
                },
                err => {
                    this.showToast("Geolocation failed. Please allow location access.", "error");
                }
            );
        } else {
            this.showToast("Geolocation not supported by this browser.", "error");
        }
    },

    async initiateSearch() {
        const bloodInput = document.getElementById("searchBlood").value;
        const cityInput = document.getElementById("searchLocation").value.trim().toLowerCase();
        const compatibilityChecked = document.getElementById("chkCompatibility").checked;

        if (!bloodInput || !cityInput) {
            this.showToast("Please select a blood group and enter a city.", "error");
            return;
        }

        this.showLoading("Finding nearby donors...");
        this.showToast("Searching for donors nearby...", "info");
        this.showSection("results");
        document.getElementById("searchFeedback").innerText = "Requesting location access...";

        const grid = document.getElementById("resultsGrid");
        grid.innerHTML = "";

        let searchedDonors = [];
        try {
            if (this.state.offlineMode) throw new Error("Offline mode active");
            const res = await fetch(`/api/donors?blood_group=${encodeURIComponent(bloodInput)}&city=${encodeURIComponent(cityInput)}&compatible=${compatibilityChecked}`);
            const data = await res.json();
            searchedDonors = data.donors || [];
        } catch (error) {
            const localDonors = JSON.parse(localStorage.getItem('bc_donors')) || [];
            const compatibilityMap = {
                'A+': ['A+', 'A-', 'O+', 'O-'],
                'A-': ['A-', 'O-'],
                'B+': ['B+', 'B-', 'O+', 'O-'],
                'B-': ['B-', 'O-'],
                'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
                'AB-': ['AB-', 'A-', 'B-', 'O-'],
                'O+': ['O+', 'O-'],
                'O-': ['O-']
            };
            const allowedGroups = compatibilityChecked ? (compatibilityMap[bloodInput] || [bloodInput]) : [bloodInput];
            
            searchedDonors = localDonors.filter(d => 
                d.available &&
                allowedGroups.includes(d.blood_group) &&
                d.city.toLowerCase().includes(cityInput)
            );
        }

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    this.state.userLocation = { lat: userLat, lng: userLng };

                    this.renderSearchResults(searchedDonors, cityInput, userLat, userLng);
                },
                err => {
                    document.getElementById("searchFeedback").innerText = "Location access denied. Displaying general results.";
                    this.renderSearchResults(searchedDonors, cityInput, null, null);
                }
            );
        } else {
            document.getElementById("searchFeedback").innerText = "Geolocation not supported.";
            this.renderSearchResults(searchedDonors, cityInput, null, null);
        }
    },

    renderSearchResults(donorsList, city, userLat, userLng) {
        const grid = document.getElementById("resultsGrid");
        grid.innerHTML = "";

        let filtered = donorsList;

        if (userLat && userLng) {
            filtered = filtered.map(d => {
                const distance = this.getDistance(userLat, userLng, d.lat, d.lng);
                return { ...d, distance };
            }).sort((a, b) => a.distance - b.distance);

            document.getElementById("searchFeedback").innerText = `Found ${filtered.length} matching donors near your location.`;
        } else {
            document.getElementById("searchFeedback").innerText = `Found ${filtered.length} matching donors in ${city}.`;
        }

        this.hideLoading();
        if (filtered.length === 0) {
            grid.innerHTML = `<div class="empty-state"><strong>No matching donors found</strong>Try adjusting the search city, turning off compatibility mode, or registering as a donor to help immediately.</div>`;
            return;
        }

        filtered.forEach(donor => {
            const card = document.createElement("div");
            card.classList.add("card", "glass", "urgency-card");

            let distanceHtml = donor.distance !== undefined ? `<p><i class="ph ph-ruler"></i> ${donor.distance.toFixed(2)} km away</p>` : '';
            let availabilityHtml = donor.available ? `<span class="availability-pill"><i class="ph ph-circle"></i> Online Now</span>` : `<span class="availability-pill" style="background:rgba(255,197,0,0.12);color:#B85C00;border-color:rgba(255,197,0,0.4);"><i class="ph ph-circle"></i> Away</span>`;
            
            const queryBlood = document.getElementById("searchBlood").value;
            let compatibilityHtml = '';
            if (donor.blood_group !== queryBlood) {
                compatibilityHtml = `<div class="compatibility-box-alert"><i class="ph ph-shield-check"></i> Compatible Match</div>`;
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
                    <h3>${donor.name}</h3>
                    ${availabilityHtml}
                </div>
                <p><i class="ph ph-map-pin"></i> ${donor.city}</p>
                <p><i class="ph ph-drop"></i> Blood Group: <strong>${donor.blood_group}</strong></p>
                ${distanceHtml}
                ${compatibilityHtml}
                <a href="tel:${donor.phone}" class="contact-btn"><i class="ph ph-phone"></i> Call Donor</a>
            `;
            grid.appendChild(card);
        });

        // Update map if it's open
        if (this.state.map) {
            this.loadDonorsOnMap(filtered);
        }
    },

    getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    toggleMap() {
        const container = document.getElementById("mapContainer");
        if (container.style.display === "none") {
            container.style.display = "block";
            // Timeout to allow DOM rendering before leaflet init
            setTimeout(() => this.initMap(), 300);
        } else {
            container.style.display = "none";
        }
    },

    initMap() {
        if (this.state.map) {
            this.state.map.invalidateSize();
            return;
        }

        // Center on user if available, else Rajahmundry
        const centerLat = this.state.userLocation ? this.state.userLocation.lat : 17.0005;
        const centerLng = this.state.userLocation ? this.state.userLocation.lng : 81.8040;

        this.state.map = L.map('map').setView([centerLat, centerLng], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(this.state.map);

        this.state.markerLayer = L.layerGroup().addTo(this.state.map);
        this.state.requestLayer = L.layerGroup().addTo(this.state.map);

        // Add User Marker
        if (this.state.userLocation) {
            L.marker([centerLat, centerLng], {
                icon: L.divIcon({
                    className: 'custom-icon',
                    html: `<div style="background:var(--blue);width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>`
                })
            }).addTo(this.state.map).bindPopup("<b>Your Location</b>").openPopup();
        }

        // Load all donors initially or let search result override it
        this.loadDonorsOnMap(this.state.donors);
    },

    loadDonorsOnMap(donorList) {
        if (!this.state.markerLayer) return;
        this.state.markerLayer.clearLayers();
        if (this.state.requestLayer) this.state.requestLayer.clearLayers();

        const donorIcon = L.divIcon({
            className: 'custom-icon',
            html: `<div style="background:var(--green);width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:2px solid white;box-shadow:0 0 10px rgba(0,200,100,0.4);"><i class="ph-fill ph-drop" style="font-size:12px;"></i></div>`,
            iconSize: [20, 20]
        });

        const unavailableIcon = L.divIcon({
            className: 'custom-icon',
            html: `<div style="background:rgba(255,197,0,0.9);width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:2px solid white;box-shadow:0 0 10px rgba(255,197,0,0.4);"><i class="ph-fill ph-drop" style="font-size:12px;"></i></div>`,
            iconSize: [20, 20]
        });

        donorList.forEach(donor => {
            const icon = donor.available ? donorIcon : unavailableIcon;
            L.marker([donor.lat, donor.lng], { icon })
                .bindPopup(`
                    <b>${donor.name}</b><br>
                    Blood: ${donor.blood_group}<br>
                    Component: ${donor.component}<br>
                    Status: ${donor.available ? 'Available now' : 'Offline'}<br>
                    <a href="tel:${donor.phone}" style="color:var(--primary);text-decoration:none;font-weight:bold;">Call</a>
                `)
                .addTo(this.state.markerLayer);
        });

        if (this.state.requests && this.state.requestLayer) {
            const requestIcon = L.divIcon({
                className: 'custom-icon',
                html: `<div style="background:var(--red);width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:2px solid white;box-shadow:0 0 10px rgba(255,70,70,0.5);"><i class="ph-fill ph-hospital" style="font-size:11px;"></i></div>`,
                iconSize: [22, 22]
            });

            this.state.requests.filter(r => r.status === 'Open').forEach(req => {
                L.marker([req.lat, req.lng], { icon: requestIcon })
                    .bindPopup(`
                        <b>${req.hospital_name}</b><br>
                        Need: ${req.blood_group} ${req.component}<br>
                        Urgency: ${req.urgency}<br>
                        <a href="tel:${req.phone}" style="color:var(--red);text-decoration:none;font-weight:bold;">Call Hospital</a>
                    `)
                    .addTo(this.state.requestLayer);
            });
        }
    },

    async postEmergencyRequest() {
        const hospitalName = document.getElementById("reqHospitalName").value.trim();
        const patientName = document.getElementById("reqPatientName").value.trim();
        const scenarioDescription = document.getElementById("reqScenario").value.trim();
        const blood = document.getElementById("reqBlood").value;
        const componentType = document.getElementById("reqComponentType").value;
        const urgency = document.getElementById("reqUrgency").value;
        const units = parseInt(document.getElementById("reqUnits").value);
        const city = document.getElementById("reqCity").value.trim();
        const address = document.getElementById("reqAddress").value.trim();
        const phone = document.getElementById("reqPhone").value.trim();

        if (!hospitalName || !blood || !componentType || !urgency || !city || !address || !phone) {
            this.showToast("Please fill all required fields.", "error");
            return;
        }

        this.showLoading("Posting urgent broadcast...");
        this.showToast("Fetching location coordinates...", "info");

        const submitRequest = async (lat, lng) => {
            const payload = {
                hospital_name: hospitalName,
                patient_name: patientName,
                scenario_description: scenarioDescription,
                blood_group: blood,
                component: componentType,
                urgency: urgency,
                units: units,
                city: city,
                address: address,
                phone: phone,
                lat: lat,
                lng: lng
            };

            try {
                let success = false;
                if (!app.state.offlineMode) {
                    try {
                        const response = await fetch('/api/requests', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (response.ok) success = true;
                    } catch (e) {
                        console.warn("Backend request write failed, writing locally.");
                    }
                }

                if (!success) {
                    const localReqs = JSON.parse(localStorage.getItem('bc_requests')) || [];
                    const newReq = { 
                        ...payload, 
                        id: Date.now(), 
                        status: 'Open', 
                        created_at: new Date().toISOString() 
                    };
                    localReqs.push(newReq);
                    localStorage.setItem('bc_requests', JSON.stringify(localReqs));
                    this.state.requests = localReqs;
                }

                // Increment homepage request count
                const requestCounter = document.querySelector('.stats-container .stat-card:nth-child(3) h2');
                if (requestCounter) {
                    requestCounter.innerText = parseInt(requestCounter.innerText) + 1;
                }

                document.getElementById("requestForm").reset();
                this.hideLoading();
                this.addNotification('Emergency request created', `${hospitalName} needs ${units} unit(s) of ${blood} ${componentType} in ${city}.`, 'warning');
                this.showToast("Emergency broadcast posted successfully!", "success");
                this.loadRequests();
            } catch (err) {
                this.hideLoading();
                this.showToast("Failed to post request.", "error");
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => {
                    submitRequest(pos.coords.latitude, pos.coords.longitude);
                },
                err => {
                    // Default to Rajahmundry coordinates with a slight random offset
                    const mockLat = 17.0005 + (Math.random() - 0.5) * 0.04;
                    const mockLng = 81.8040 + (Math.random() - 0.5) * 0.04;
                    submitRequest(mockLat, mockLng);
                }
            );
        } else {
            const mockLat = 17.0005 + (Math.random() - 0.5) * 0.04;
            const mockLng = 81.8040 + (Math.random() - 0.5) * 0.04;
            submitRequest(mockLat, mockLng);
        }
    },

    renderRequestBoard(filterCity = '') {
        const board = document.getElementById("requestBoardList");
        if (!board) return;
        
        board.innerHTML = "";
        
        let filtered = this.state.requests.filter(r => r.status === 'Open');
        if (filterCity) {
            filtered = filtered.filter(r => r.city.toLowerCase().includes(filterCity.toLowerCase()));
        }

        if (filtered.length === 0) {
            board.innerHTML = `<div class="empty-state"><strong>No active emergency requests</strong>Everything looks stable right now. Check back later or post a new request if help is needed.</div>`;
            return;
        }

        filtered.forEach(req => {
            const card = document.createElement("div");
            card.className = `request-card ${req.urgency.toLowerCase()}`;
            
            card.innerHTML = `
                <div class="request-card-header">
                    <h3>${req.hospital_name}</h3>
                    <span class="urgency-badge ${req.urgency.toLowerCase()}">${req.urgency}</span>
                </div>
                ${req.scenario_description ? `<p><i class="ph ph-newspaper"></i> ${req.scenario_description}</p>` : ''}
                <p><i class="ph-fill ph-drop text-primary"></i> Blood Required: <strong>${req.blood_group}</strong> (${req.component})</p>
                <p><i class="ph ph-hand-heart"></i> Units Needed: <strong>${req.units} Unit(s)</strong></p>
                <p><i class="ph ph-map-pin"></i> Hospital Address: ${req.address}, ${req.city}</p>
                <p><i class="ph ph-phone"></i> Contact: <strong>${req.phone}</strong></p>
                <div class="request-card-actions">
                    <button class="action-btn action-btn-primary" onclick="app.donateToRequest(${req.id})">
                        <i class="ph ph-heart"></i> I Can Donate
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="app.viewRequestOnMap(${req.id})">
                        <i class="ph ph-map-trifold"></i> Map View
                    </button>
                </div>
            `;
            board.appendChild(card);
        });
    },

    filterRequestBoard() {
        const val = document.getElementById("boardFilterCity").value.trim();
        this.renderRequestBoard(val);
    },

    saveDonationHistory(event) {
        const history = JSON.parse(localStorage.getItem('bc_history')) || [];
        history.unshift(event);
        localStorage.setItem('bc_history', JSON.stringify(history.slice(0, 12)));
        this.state.donationHistory = history;
    },

    getDonationHistory() {
        return JSON.parse(localStorage.getItem('bc_history')) || [];
    },

    renderDonationHistory(containerId = 'donationHistoryList') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const history = this.getDonationHistory();
        this.state.donationHistory = history;

        if (history.length === 0) {
            container.innerHTML = `<p style="color: var(--text-muted);">No donation events recorded yet. Register or respond to an urgent request to get started.</p>`;
        } else {
            container.innerHTML = history.map(item => `
                <div class="history-item glass" style="padding:16px; margin-bottom:12px; border:1px solid var(--glass-border);">
                    <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                        <strong style="font-size:14px;">${item.title}</strong>
                        <span style="font-size:12px; color: var(--text-muted);">${new Date(item.date).toLocaleDateString()}</span>
                    </div>
                    <p style="margin-top:8px; color: var(--text-muted); font-size:13px; line-height:1.5;">${item.details}</p>
                </div>
            `).join('');
        }

        const impactCount = history.reduce((sum, event) => {
            if (event.type === 'Fulfilled Request') return sum + 3;
            if (event.type === 'Registration') return sum + 1;
            return sum;
        }, 0);

        const score = document.querySelector('.impact-score h1');
        if (score) score.innerText = impactCount || 0;
        this.renderProfileSummary();
        if (containerId === 'donationHistoryList') {
            this.renderProfileActivityFeed();
        }
    },

    setProfileView(view, { openPopup = true } = {}) {
        this.state.profileView = view;
        const historyBtn = document.getElementById('profileHistoryBtn');
        const activityBtn = document.getElementById('profileActivityBtn');
        const notificationsBtn = document.getElementById('profileNotificationsBtn');

        if (historyBtn && activityBtn && notificationsBtn) {
            historyBtn.classList.toggle('active', view === 'history');
            activityBtn.classList.toggle('active', view === 'activity');
            notificationsBtn.classList.toggle('active', view === 'notifications');
        }

        if (openPopup) {
            if (view === 'activity') {
                this.openProfilePopup('activity');
            } else if (view === 'notifications') {
                this.openProfilePopup('notifications');
            } else {
                this.openProfilePopup('history');
            }
        }

        this.renderProfileSummary();
    },

    openProfilePopup(view) {
        const overlay = document.getElementById('profilePopupOverlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        document.body.classList.add('no-scroll');
        this.renderProfilePopupContent(view);
    },

    closeProfilePopup() {
        const overlay = document.getElementById('profilePopupOverlay');
        if (!overlay) return;
        overlay.style.display = 'none';
        document.body.classList.remove('no-scroll');
    },

    renderProfilePopupContent(view) {
        const titleEl = document.getElementById('profilePopupTitle');
        const descEl = document.getElementById('profilePopupDescription');
        if (!titleEl || !descEl) return;

        if (view === 'activity') {
            titleEl.innerText = 'Live Activity Feed';
            descEl.innerText = 'Recent donation and urgent request events from your profile.';
            this.renderProfileActivityFeed('profilePopupBody');
        } else if (view === 'notifications') {
            titleEl.innerText = 'Notification Center';
            descEl.innerText = 'All alerts and updates for your donor journey.';
            this.renderNotifications('profilePopupBody');
        } else {
            titleEl.innerText = 'Donation History';
            descEl.innerText = 'Your past donations and impact timeline in a popup view.';
            this.renderDonationHistory('profilePopupBody');
        }
    },

    toggleProfileView() {
        const newView = this.state.profileView === 'activity' ? 'history' : 'activity';
        if (!document.getElementById('profile').classList.contains('active')) {
            this.showSection('profile');
        }
        this.setProfileView(newView);
    },

    renderProfileActivityFeed(containerId = 'profileActivityFeed') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const history = this.getDonationHistory();
        const requestEvents = (this.state.requests || []).filter(r => r.status === 'Open').map(r => ({
            date: r.created_at,
            title: `Urgent request posted`,
            details: `${r.hospital_name} needs ${r.units} unit(s) of ${r.blood_group} ${r.component} in ${r.city}.`,
            type: 'Request'
        }));

        const activities = [
            ...history.map(item => ({ date: item.date, title: item.title, details: item.details, type: item.type })),
            ...requestEvents
        ]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 8);

        if (!activities.length) {
            container.innerHTML = `<p style="color: var(--text-muted);">No live profile activity yet.</p>`;
        } else {
            container.innerHTML = activities.map(item => `
                <div class="history-item glass" style="padding:16px; margin-bottom:12px; border:1px solid var(--glass-border);">
                    <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                        <strong style="font-size:14px;">${item.title}</strong>
                        <span style="font-size:12px; color: var(--text-muted);">${new Date(item.date).toLocaleDateString()}</span>
                    </div>
                    <p style="margin-top:8px; color: var(--text-muted); font-size:13px; line-height:1.5;">${item.details}</p>
                </div>
            `).join('');
        }

        const activityCountEl = document.getElementById('profileActivityCount');
        if (activityCountEl) activityCountEl.innerText = Math.max(activities.length, 0);
    },

    renderProfileSummary() {
        const history = this.getDonationHistory();
        const totalDonations = history.filter(item => item.type === 'Fulfilled Request' || item.type === 'Registration').length;
        const activeRequests = (this.state.requests || []).filter(r => r.status === 'Open').length;
        const activityCount = Math.max(totalDonations + activeRequests, 0);

        const donationCountEl = document.getElementById('profileDonationCount');
        const requestCountEl = document.getElementById('profileOpenRequests');
        const activityCountEl = document.getElementById('profileActivityCount');

        if (donationCountEl) donationCountEl.innerText = totalDonations;
        if (requestCountEl) requestCountEl.innerText = activeRequests;
        if (activityCountEl) activityCountEl.innerText = activityCount;
    },

    async donateToRequest(id) {
        this.showToast("Processing donation commit...", "info");
        
        try {
            let success = false;
        let req = this.state.requests.find(r => r.id === id);

        if (!this.state.offlineMode) {
            try {
                const response = await fetch(`/api/requests/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'Fulfilled' })
                });
                if (response.ok) success = true;
            } catch (e) {
                console.warn("Backend update failed, updating local storage.");
            }
        }

        if (!success) {
            const localReqs = JSON.parse(localStorage.getItem('bc_requests')) || [];
            const localReq = localReqs.find(r => r.id === id);
            if (localReq) {
                localReq.status = 'Fulfilled';
                localStorage.setItem('bc_requests', JSON.stringify(localReqs));
                this.state.requests = localReqs;
                req = localReq;
            }
        }

            // Award badges & advance journey stepper
            const steps = document.querySelectorAll('.stepper-container .step');
            if (steps.length > 0) {
                steps.forEach(s => {
                    s.classList.add('completed');
                    s.classList.remove('active-step');
                });
                const stepLines = document.querySelectorAll('.stepper-container .step-line');
                stepLines.forEach(l => l.classList.add('active'));
            }

            // Award "Rapid Responder" badge
            const badgesContainer = document.querySelector('.badges-container');
            if (badgesContainer) {
                const badgeExist = Array.from(badgesContainer.children).some(b => b.innerText.includes("Rapid Responder"));
                if (!badgeExist) {
                    const newBadge = document.createElement("div");
                    newBadge.className = "badge-item";
                    newBadge.title = "Responded to an urgent emergency broadcast";
                    newBadge.innerHTML = `<i class="ph-fill ph-lightning text-orange"></i> Rapid Responder`;
                    badgesContainer.appendChild(newBadge);
                }
            }

            this.saveDonationHistory({
                type: 'Fulfilled Request',
                date: new Date().toISOString(),
                title: `Committed to urgent ${req.blood_group} support`,
                details: `Responded to ${req.hospital_name} for ${req.component}. ${req.units} unit(s) pledged.`
            });
            this.renderDonationHistory();
            this.addNotification('Donation committed', `You pledged ${req.units} unit(s) of ${req.blood_group} for ${req.hospital_name}.`, 'success');

            // Increment Lives Saved counter dynamically (+3 lives saved)
            const livesCounter = document.querySelector('.stats-container .stat-card:nth-child(2) h2');
            if (livesCounter) {
                livesCounter.innerText = parseInt(livesCounter.innerText) + 3;
            }

            this.showToast("Outstanding! You have committed to donate. Stepper & Profile awards updated!", "success");
            this.loadRequests();
            this.showSection("profile");
        } catch (err) {
            this.showToast("Failed to process request.", "error");
        }
    },

    viewRequestOnMap(id) {
        const req = this.state.requests.find(r => r.id === id);
        if (!req) return;

        this.showSection("results");
        const container = document.getElementById("mapContainer");
        container.style.display = "block";
        
        setTimeout(() => {
            this.initMap();
            this.state.map.setView([req.lat, req.lng], 14);
            
            // Render specific patient hospital pulsing circle
            L.circle([req.lat, req.lng], {
                color: 'var(--primary)',
                fillColor: 'var(--primary)',
                fillOpacity: 0.4,
                radius: 250
            }).addTo(this.state.map)
              .bindPopup(`<b>🚨 EMERGENCY PATIENT:</b><br>${req.hospital_name}<br>Needs ${req.blood_group} ${req.component} immediately!`)
              .openPopup();
        }, 300);
    },

    async adminLogin() {
        const user = document.getElementById("adminUser").value.trim();
        const pass = document.getElementById("adminPass").value;

        if ((user === 'Bloodconnect' || user === 'cityhospital' || user === 'hospital') && pass === '1234') {
            this.state.currentUser = (user === 'Bloodconnect') ? 'admin' : 'hospital';
            
            // Adjust title texts based on user
            const portalTitle = document.getElementById("adminPortalTitle");
            const portalSubtitle = document.getElementById("adminPortalSubtitle");
            
            if (this.state.currentUser === 'hospital') {
                portalTitle.innerHTML = `<i class="ph ph-hospital"></i> Hospital Portal Dashboard`;
                portalSubtitle.innerText = "Manage your emergency blood broadcasts and active matched requests.";
            } else {
                portalTitle.innerHTML = `<i class="ph ph-shield-check"></i> Super Admin Dashboard`;
                portalSubtitle.innerText = "System management panel: Oversee registered donors and emergency board.";
            }
            
            document.getElementById("adminLoginBox").style.display = "none";
            document.getElementById("adminPanel").style.display = "block";
            
            this.showToast(`Logged in successfully as ${this.state.currentUser === 'admin' ? 'Admin' : 'Hospital'}`, "success");
            this.loadAdminData();
        } else {
            this.showToast("Invalid Credentials. Use cityhospital/1234 or Bloodconnect/1234", "error");
        }
    },

    logoutAdmin() {
        this.state.currentUser = null;
        document.getElementById("adminUser").value = "";
        document.getElementById("adminPass").value = "";
        document.getElementById("adminLoginBox").style.display = "block";
        document.getElementById("adminPanel").style.display = "none";
        this.showToast("Logged out successfully.", "info");
    },

    async loadAdminData() {
        const list = document.getElementById("adminDonorList");
        const reqsList = document.getElementById("hospitalRequestsList");
        
        list.innerHTML = "Loading donors...";
        reqsList.innerHTML = "Loading requests...";

        // RENDER DONORS DIRECTORY
        try {
            let donors = [];
            if (!this.state.offlineMode) {
                try {
                    const res = await fetch('/api/admin/donors');
                    const data = await res.json();
                    donors = data.donors || [];
                } catch (e) {
                    console.warn("Backend read failed, using localStorage.");
                }
            }
            if (donors.length === 0) {
                donors = JSON.parse(localStorage.getItem('bc_donors')) || [];
            }
            
            list.innerHTML = "";
            if (donors.length === 0) {
                list.innerHTML = "<p>No registered donors in system.</p>";
            } else {
                donors.forEach(d => {
                    const dName = d.name;
                    const dBlood = d.blood_group || d.blood || 'Unknown';
                    const isAvailable = d.available;
                    
                    list.innerHTML += `
                        <div class="admin-list-row">
                            <div>
                                <strong>${dName}</strong> (${dBlood})<br>
                                <span style="font-size:12px;color:var(--text-muted);">${d.city} • ${d.phone}</span>
                            </div>
                            <div class="admin-actions">
                                <button class="admin-action-btn admin-btn-toggle" onclick="app.toggleDonorAvailability(${d.id})">
                                    ${isAvailable ? 'Available' : 'Unavailable'}
                                </button>
                                <button class="admin-action-btn admin-btn-delete" onclick="app.deleteDonor(${d.id})">
                                    <i class="ph ph-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        } catch (error) {
            list.innerHTML = "<p>Failed to load donors directory.</p>";
        }

        // RENDER HOSPITAL EMERGENCY REQUESTS
        try {
            let reqs = [];
            if (!this.state.offlineMode) {
                try {
                    const res = await fetch('/api/requests?status=all');
                    const data = await res.json();
                    reqs = data.requests || [];
                } catch (e) {}
            }
            if (reqs.length === 0) {
                reqs = JSON.parse(localStorage.getItem('bc_requests')) || [];
            }

            reqsList.innerHTML = "";
            if (reqs.length === 0) {
                reqsList.innerHTML = "<p>No emergency requests posted.</p>";
            } else {
                reqs.forEach(r => {
                    const isFulfilled = r.status === 'Fulfilled';
                    const fulfillBtn = !isFulfilled ? 
                        `<button class="admin-action-btn admin-btn-fulfill" onclick="app.fulfillRequestAdmin(${r.id})"><i class="ph ph-check-square"></i> Fulfill</button>` : 
                        `<span style="font-size:11px;background:var(--green-light);color:var(--green);padding:4px 8px;border-radius:6px;font-weight:700;">Fulfilled</span>`;

                    reqsList.innerHTML += `
                        <div class="admin-list-row">
                            <div>
                                <strong>Hospital: ${r.hospital_name}</strong> (${r.blood_group})<br>
                                <span style="font-size:12px;color:var(--text-muted);">${r.city} • Need: ${r.component} • Urgency: ${r.urgency}</span>
                            </div>
                            <div class="admin-actions">
                                ${fulfillBtn}
                            </div>
                        </div>
                    `;
                });
            }
        } catch (error) {
            reqsList.innerHTML = "<p>Failed to load emergency requests.</p>";
        }
    },

    async toggleDonorAvailability(id) {
        // Toggle donor availability
        const localDonors = JSON.parse(localStorage.getItem('bc_donors')) || [];
        const donor = localDonors.find(d => d.id === id);
        if (donor) {
            donor.available = !donor.available;
            localStorage.setItem('bc_donors', JSON.stringify(localDonors));
            this.state.donors = localDonors;
            this.showToast("Availability status updated successfully", "success");
            this.loadAdminData();
            this.updateLiveInventory();
            this.updateLiveOnlineCount();
        }
    },

    async deleteDonor(id) {
        if (!confirm("Are you sure you want to delete this donor?")) return;
        
        const localDonors = JSON.parse(localStorage.getItem('bc_donors')) || [];
        const filtered = localDonors.filter(d => d.id !== id);
        localStorage.setItem('bc_donors', JSON.stringify(filtered));
        this.state.donors = filtered;
        
        // Decrement homepage count
        const donorCounter = document.querySelector('.stats-container .stat-card:nth-child(1) h2');
        if (donorCounter) {
            donorCounter.innerText = Math.max(0, parseInt(donorCounter.innerText) - 1);
        }

        this.showToast("Donor record deleted successfully", "success");
        this.loadAdminData();
        this.updateLiveInventory();
        this.updateLiveOnlineCount();
    },

    async fulfillRequestAdmin(id) {
        const localReqs = JSON.parse(localStorage.getItem('bc_requests')) || [];
        const req = localReqs.find(r => r.id === id);
        if (req) {
            req.status = 'Fulfilled';
            localStorage.setItem('bc_requests', JSON.stringify(localReqs));
            this.state.requests = localReqs;
            
            // Increment Lives Saved counter (+3 lives saved)
            const livesCounter = document.querySelector('.stats-container .stat-card:nth-child(2) h2');
            if (livesCounter) {
                livesCounter.innerText = parseInt(livesCounter.innerText) + 3;
            }

            this.addNotification('Request fulfilled', `${req.hospital_name} request is now marked fulfilled.`, 'success');
            this.showToast("Broadcast fulfilled successfully!", "success");
            this.loadAdminData();
            this.loadRequests();
        }
    },

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        const icon = type === 'success' ? 'ph-check-circle text-green' : (type === 'error' ? 'ph-x-circle text-primary' : 'ph-info text-blue');

        toast.innerHTML = `<i class="ph ${icon}"></i><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => {
                if (toast.parentElement) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
