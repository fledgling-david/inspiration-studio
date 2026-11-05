function installationPanel(r) {
  const details = SkillHandoff.info(r);
  const labels = details.type === 'skill'
    ? ['安装并使用', details.state === 'located' ? '已定位 SKILL.md' : '先定位对应 Skill']
    : details.type === 'prompt' ? ['把玩法带进创作', '提示词案例'] : ['开始使用这个工作流', '工具 / 工作流'];
  return `<section class="installation-panel" id="installation-panel" aria-label="安装与使用">
    <div class="installation-heading"><span class="installation-icon">${icon(details.type === 'skill' ? 'download' : 'sparkles')}</span><div><h3>${labels[0]}</h3><p>${labels[1]}</p></div><button class="text-button" id="installation-help">怎么开始？</button></div>
    <div class="installation-entry" id="installation-entry"></div>
    <label class="installation-agent-label" for="installation-agent">选择你的智能体</label>
    <select id="installation-agent" aria-label="选择安装或使用的智能体">${Object.entries(SkillHandoff.agents).map(([id, a]) => `<option value="${id}">${a.name}</option>`).join('')}</select>
    <div class="installation-buttons" id="installation-buttons"></div>
    <p class="installation-hint" id="installation-hint"></p>
    <details class="installation-request"><summary>查看完整请求</summary><textarea id="installation-request" aria-label="完整安装或使用请求" readonly rows="5"></textarea></details>
    <details class="installation-terminal" id="installation-terminal"><summary>终端安装方式（可选）</summary><p>需要 Node.js 22.20+。在项目目录的终端运行，按提示选择技能；默认安装到当前项目。</p><code id="installation-command"></code><button class="text-button" id="installation-copy-command">${icon('copy')}复制命令</button><a href="https://github.com/vercel-labs/skills" target="_blank" rel="noopener noreferrer">安装工具说明 ↗</a></details>
  </section>`;
}

function bindInstallation(r) {
  const selector = document.querySelector('#installation-agent');
  selector.value = Object.hasOwn(SkillHandoff.agents, saved.installAgent) ? saved.installAgent : 'codex';
  function refresh() {
    const agent = selector.value, target = SkillHandoff.agents[agent], details = SkillHandoff.info(r);
    const request = SkillHandoff.request(r, agent), url = SkillHandoff.link(r, agent), command = SkillHandoff.command(r, agent);
    const entry = document.querySelector('#installation-entry');
    if (details.type === 'skill' && details.state === 'located') {
      entry.innerHTML = `<span>当前技能入口</span><a href="${esc(details.entryURL)}" target="_blank" rel="noopener noreferrer">${esc(details.path)}${icon('arrow-up-right')}</a>`;
    } else if (details.type === 'skill') {
      entry.textContent = '仓库中可能包含多个技能。请求会让智能体先找到这个案例对应的入口，再安装。';
    } else if (details.type === 'prompt') {
      entry.textContent = '这是创意玩法，暂不需要安装 Skill。把来源和玩法带给智能体，即可继续。';
    } else {
      entry.textContent = '这个条目是工具或工作流。智能体会先按原项目说明确认依赖与输入，再指导配置和使用。';
    }
    const verb = details.type === 'skill' ? '安装' : details.type === 'prompt' ? '尝试' : '配置';
    document.querySelector('#installation-buttons').innerHTML = url
      ? `<a class="primary-button installation-launch" href="${esc(url)}" ${agent === 'cursor' ? 'target="_blank" rel="noopener noreferrer"' : ''} id="installation-launch">在 ${target.name} 中${verb}${icon('arrow-up-right')}</a><button class="secondary-button" id="installation-copy">${icon('copy')}复制请求</button>`
      : `<button class="primary-button" id="installation-copy">${icon('copy')}复制给 ${target.name}</button>`;
    document.querySelector('#installation-hint').textContent = url
      ? `需要已安装 ${target.name}。点击后预填请求，在应用中发送后才会执行。未能打开时，可复制请求粘贴。`
      : '复制后，粘贴到智能体的对话中并发送。安装与运行条件会在所选智能体中处理。';
    document.querySelector('#installation-request').value = request;
    document.querySelector('#installation-terminal').hidden = !command;
    document.querySelector('#installation-command').textContent = command;
    document.querySelector('#installation-copy').onclick = () => copy(request, details.type === 'skill' ? '安装请求已复制，粘贴到智能体并发送' : '使用请求已复制，粘贴后即可继续');
    const launch = document.querySelector('#installation-launch');
    if (launch) launch.onclick = () => toast(`已请求打开 ${target.name}；请在应用中发送预填内容`);
    document.querySelector('#installation-copy-command').onclick = () => copy(command, '安装命令已复制，请在项目终端运行');
  }
  selector.onchange = () => { saved.installAgent = selector.value; persist(); refresh(); };
  document.querySelector('#installation-help').onclick = () => openDialog('installation-guide');
  refresh();
}

function focusInstallation() {
  document.querySelector('#installation-panel')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  document.querySelector('#installation-agent')?.focus({ preventScroll: true });
}

function personalDetailActions(r) {
  const favorite = saved.favorites.includes(r.id), workflow = saved.workflow.includes(r.id);
  return `<button class="secondary-button" data-favorite="${esc(r.id)}" aria-pressed="${favorite}">${icon('heart')}${favorite ? '已收藏' : '收藏案例'}</button><button class="secondary-button" data-workflow="${esc(r.id)}" aria-pressed="${workflow}">${icon(workflow ? 'check' : 'plus')}${workflow ? '已加入清单' : '加入创作清单'}</button>`;
}
