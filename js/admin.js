const fetchSecure = async (url, options = {}) => {
            const token = sessionStorage.getItem('sys_op_token');
            const headers = { ...options.headers };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            if (!headers['Content-Type'] && options.body) headers['Content-Type'] = 'application/json';
            
            const res = await fetch(url, { ...options, headers });
            if (res.status === 401) {
                alert("控制台令牌失效，请返回主枢纽重新 SYS_OP 认证。");
                window.location.href = '/';
            }
            return res;
        };

        const SysUI = {
            createContainer(id) {
                const existing = document.getElementById(id);
                if(existing) existing.remove();
                const overlay = document.createElement('div');
                overlay.id = id; overlay.className = 'cyber-overlay';
                document.getElementById('sys-modal-root').appendChild(overlay);
                return overlay;
            },
            close(overlay) { overlay.classList.remove('active'); setTimeout(() => overlay.remove(), 250); },
            showPrompt(title, msg, defaultVal = '') {
                return new Promise(resolve => {
                    const overlay = this.createContainer('cyber-prompt');
                    overlay.innerHTML = `
                        <div class="cyber-modal">
                            <i class="fa-solid fa-xmark modal-close-x" id="p-close-x"></i>
                            <div class="cyber-modal-title" style="color:var(--cyan);"><i class="fa-solid fa-terminal"></i> ${title}</div>
                            <div class="cyber-modal-msg" style="margin-bottom:15px;">${msg}</div>
                            <input type="text" id="prompt-input" value="${defaultVal}" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid var(--border); color:var(--text); border-radius:6px; margin-bottom:20px; outline:none;">
                            <div class="cyber-modal-actions">
                                <button class="btn-modal cancel" id="p-cancel">取消</button>
                                <button class="btn-modal confirm" id="p-ok">确认</button>
                            </div>
                        </div>`;
                    requestAnimationFrame(() => overlay.classList.add('active'));
                    const input = overlay.querySelector('#prompt-input'); input.focus();

                    const cancelLogic = () => { this.close(overlay); resolve(null); };
                    overlay.querySelector('#p-cancel').onclick = cancelLogic;
                    overlay.querySelector('#p-close-x').onclick = cancelLogic;
                    overlay.querySelector('#p-ok').onclick = () => { this.close(overlay); resolve(input.value); };
                });
            },
            showConfirm(title, msg, isDanger = false) {
                return new Promise(resolve => {
                    const overlay = this.createContainer('cyber-confirm');
                    const themeColor = isDanger ? 'var(--red)' : 'var(--cyan)';
                    const btnClass = isDanger ? 'danger' : 'confirm';
                    const icon = isDanger ? 'fa-triangle-exclamation' : 'fa-circle-check';
                    overlay.innerHTML = `
                        <div class="cyber-modal" style="border-color:${themeColor}">
                            <i class="fa-solid fa-xmark modal-close-x" id="c-close-x"></i>
                            <div class="cyber-modal-title" style="color:${themeColor};"><i class="fa-solid ${icon}"></i> ${title}</div>
                            <div class="cyber-modal-msg" style="margin-bottom:20px;">${msg}</div>
                            <div class="cyber-modal-actions">
                                <button class="btn-modal cancel" id="c-cancel">取消</button>
                                <button class="btn-modal ${btnClass}" id="c-ok">确认</button>
                            </div>
                        </div>`;
                    requestAnimationFrame(() => overlay.classList.add('active'));

                    const cancelLogic = () => { this.close(overlay); resolve(false); };
                    overlay.querySelector('#c-cancel').onclick = cancelLogic;
                    overlay.querySelector('#c-close-x').onclick = cancelLogic;
                    overlay.querySelector('#c-ok').onclick = () => { this.close(overlay); resolve(true); };
                });
            },
            showNodeEditor(node) {
                return new Promise(resolve => {
                    const overlay = this.createContainer('cyber-editor');
                    const catOptions = globalCategories.map(c => `<option value="${c.name}" ${c.name===node.category?'selected':''}>${c.name}</option>`).join('');
                    overlay.innerHTML = `
                        <div class="cyber-modal" style="max-width: 500px; border-color: var(--cyan);">
                            <i class="fa-solid fa-xmark modal-close-x" id="e-close-x"></i>
                            <div class="cyber-modal-title" style="color: var(--cyan); border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:15px;"><i class="fa-solid fa-pen-ruler"></i> 覆写节点配置 (MODIFY)</div>
                            <form id="cyber-edit-form">
                                <div class="form-group">
                                    <label>目标链接 (URL)</label>
                                    <div class="input-btn-group">
                                        <input type="url" id="e-url" value="${node.url}" required>
                                        <button type="button" id="e-btn-parse" class="btn btn-ai" title="AI边缘重解"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
                                    </div>
                                </div>
                                <div class="form-group"><label>节点名称 (Title)</label><input type="text" id="e-title" value="${node.title}" required></div>
                                <div class="form-group"><label>特征描述 (Description)</label><textarea id="e-desc" rows="2">${node.description||''}</textarea></div>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                                    <div class="form-group"><label>图标地址 (支持 fa-xx)</label><input type="text" id="e-icon" value="${node.icon||''}"></div>
                                    <div class="form-group"><label>归属分类 (Category)</label><select id="e-category">${catOptions}</select></div>
                                </div>
                                <div class="cyber-modal-actions" style="margin-top: 15px;">
                                    <button type="button" class="btn-modal cancel" id="e-cancel">放弃修改</button>
                                    <button type="submit" class="btn-modal confirm">保存覆写</button>
                                </div>
                            </form>
                        </div>`;
                    requestAnimationFrame(() => overlay.classList.add('active'));

                    const cancelLogic = () => { this.close(overlay); resolve(null); };
                    overlay.querySelector('#e-cancel').onclick = cancelLogic;
                    overlay.querySelector('#e-close-x').onclick = cancelLogic;

                    const btnParse = overlay.querySelector('#e-btn-parse');
                    btnParse.onclick = async () => {
                        const urlInput = overlay.querySelector('#e-url').value;
                        if (!urlInput) return;
                        const oriHtml = btnParse.innerHTML;
                        btnParse.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; btnParse.disabled = true;
                        try {
                            const res = await fetchSecure('/api/parse', { method: 'POST', body: JSON.stringify({ url: urlInput }) });
                            if (res.ok) {
                                const data = await res.json();
                                if(data.title) overlay.querySelector('#e-title').value = data.title;
                                if(data.description) overlay.querySelector('#e-desc').value = data.description;
                                if(data.icon !== undefined) overlay.querySelector('#e-icon').value = data.icon;
                            }
                        } finally {
                            btnParse.innerHTML = oriHtml; btnParse.disabled = false;
                        }
                    };

                    overlay.querySelector('#cyber-edit-form').onsubmit = (e) => {
                        e.preventDefault();
                        resolve({ id: node.id, title: overlay.querySelector('#e-title').value, url: overlay.querySelector('#e-url').value, description: overlay.querySelector('#e-desc').value, icon: overlay.querySelector('#e-icon').value, category: overlay.querySelector('#e-category').value, color_theme: 'cyan' });
                        this.close(overlay);
                    };
                });
            }
        };

        let globalCategories = [];
        let globalNodes = [];
        const statusMsg = document.getElementById('status-msg');

        async function fetchSystemData() {
            try {
                const [catRes, nodeRes] = await Promise.all([fetchSecure('/api/categories'), fetchSecure('/api/nodes')]);
                globalCategories = await catRes.json();
                globalNodes = await nodeRes.json();
                renderCategories();
                renderNodes();
            } catch (err) {
                document.getElementById('node-list-container').innerHTML = '<span style="color:var(--red);">核心链路断开。</span>';
            }
        }

        function renderCategories() {
            const list = document.getElementById('cat-list');
            document.getElementById('node-category').innerHTML = globalCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join('') || '<option value="Default">Default</option>';
            list.innerHTML = '';

            globalCategories.forEach((c, index) => {
                const tag = document.createElement('div');
                tag.className = 'cat-tag'; tag.draggable = true;
                tag.innerHTML = `
                    <i class="fa-solid fa-grip-lines" style="cursor:grab;" title="拖拽排序"></i>
                    <span>${c.name}</span>
                    <i class="fa-solid fa-pen edit" title="重命名" onclick="editCategory(${c.id}, '${c.name}')"></i>
                    <i class="fa-solid fa-trash del" title="销毁" onclick="deleteCategory(${c.id}, '${c.name}')"></i>
                `;

                tag.addEventListener('dragstart', (e) => { e.target.classList.add('dragging'); e.dataTransfer.setData('text/plain', index); });
                tag.addEventListener('dragend', (e) => e.target.classList.remove('dragging'));
                tag.addEventListener('dragover', (e) => { e.preventDefault(); tag.classList.add('drag-over'); });
                tag.addEventListener('dragleave', () => tag.classList.remove('drag-over'));
                tag.addEventListener('drop', async (e) => {
                    e.preventDefault(); tag.classList.remove('drag-over');
                    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                    if (fromIdx === index) return;
                    const item = globalCategories.splice(fromIdx, 1)[0];
                    globalCategories.splice(index, 0, item);
                    renderCategories();
                    await fetchSecure('/api/categories', { method: 'PUT', body: JSON.stringify(globalCategories) });
                });
                list.appendChild(tag);
            });
        }

        async function addCategory() {
            const name = document.getElementById('new-cat-name').value.trim();
            if(!name) return;
            await fetchSecure('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
            document.getElementById('new-cat-name').value = '';
            fetchSystemData();
        }

        async function editCategory(id, oldName) {
            const newName = await SysUI.showPrompt('重命名防区', `当前名称: [ ${oldName} ]`, oldName);
            if (newName && newName !== oldName) {
                await fetchSecure('/api/categories', { method: 'PUT', body: JSON.stringify({ id, name: newName }) });
                fetchSystemData();
            }
        }

        async function deleteCategory(id, name) {
            if (await SysUI.showConfirm('危险操作', `确定要彻底销毁防区 [ ${name} ] 吗？<br>该分类下的节点将被悬空。`, true)) {
                await fetchSecure('/api/categories', { method: 'DELETE', body: JSON.stringify({ id }) });
                fetchSystemData();
            }
        }

        function renderNodes() {
            const container = document.getElementById('node-list-container');
            if (globalNodes.length === 0) return container.innerHTML = '<span style="color:var(--text-muted);">暂无记录</span>';
            container.innerHTML = globalNodes.map(link => `
                <div class="node-item">
                    <div class="node-info">
                        <h4>${link.title} <span class="badge">${link.category}</span></h4>
                        <p>${link.url}</p>
                    </div>
                    <div class="action-btns">
                        <button class="btn-icon edit" onclick="triggerNodeEdit(${link.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-icon del" onclick="triggerNodeDelete(${link.id}, '${link.title.replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }

        window.triggerNodeEdit = async function(id) {
            const node = globalNodes.find(n => n.id === id);
            if (!node) return;
            const updatedNode = await SysUI.showNodeEditor(node);
            if (updatedNode) {
                await fetchSecure('/api/nodes', { method: 'PUT', body: JSON.stringify(updatedNode) });
                fetchSystemData();
            }
        };

        window.triggerNodeDelete = async function(id, title) {
            if (await SysUI.showConfirm('警告', `确定抹除探针 [ ${title} ] 吗？`, true)) {
                await fetchSecure('/api/nodes', { method: 'DELETE', body: JSON.stringify({ id }) });
                fetchSystemData();
            }
        };

        document.getElementById('add-node-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            statusMsg.style.color = "var(--cyan)"; statusMsg.innerText = "正在同步至 D1 核心...";
            const payload = { title: document.getElementById('node-title').value, url: document.getElementById('node-url').value, description: document.getElementById('node-desc').value, category: document.getElementById('node-category').value, icon: document.getElementById('node-icon').value, color_theme: 'cyan' };
            if ((await fetchSecure('/api/nodes', { method: 'POST', body: JSON.stringify(payload) })).ok) {
                statusMsg.style.color = "var(--green)"; statusMsg.innerText = "节点注入成功。";
                document.getElementById('add-node-form').reset();
                setTimeout(() => statusMsg.innerText = "", 3000);
                fetchSystemData();
            }
        });

        document.getElementById('btn-parse').addEventListener('click', async () => {
            const urlInput = document.getElementById('node-url').value;
            if (!urlInput) { statusMsg.style.color = "var(--red)"; statusMsg.innerText = "错误：URL 为空。"; return; }

            const btn = document.getElementById('btn-parse');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; btn.disabled = true;
            statusMsg.style.color = "var(--pink)"; statusMsg.innerText = "边缘 AI 靶向解析中...";

            try {
                const res = await fetchSecure('/api/parse', { method: 'POST', body: JSON.stringify({ url: urlInput }) });
                if (res.ok) {
                    const data = await res.json();
                    if(data.title) document.getElementById('node-title').value = data.title;
                    if(data.description) document.getElementById('node-desc').value = data.description;
                    if(data.icon !== undefined) document.getElementById('node-icon').value = data.icon;
                    if(data.category) {
                        const select = document.getElementById('node-category');
                        let exists = false;
                        for (let i = 0; i < select.options.length; i++) {
                            if (select.options[i].value === data.category) { exists = true; break; }
                        }
                        if (!exists) {
                            const newOption = document.createElement('option');
                            newOption.value = data.category;
                            newOption.text = data.category + " (AI智能)";
                            select.appendChild(newOption);
                        }
                        select.value = data.category;
                    }
                    statusMsg.style.color = "var(--green)"; statusMsg.innerText = "解析完成。";
                }
            } catch(e) {
                statusMsg.style.color = "var(--red)"; statusMsg.innerText = "解析失败，请检查 URL。";
            } finally {
                btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>'; btn.disabled = false;
            }
        });

        window.onload = fetchSystemData;