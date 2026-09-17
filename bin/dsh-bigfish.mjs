#!/usr/bin/env node
import { installSkill } from './install-skill.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  console.log(`DSH Bigfish

安装宠物插件：
  dsh plugin --profile web add dsh-bigfish

安装随包提供的角色制作 Skill：
  npx --yes dsh-bigfish install-skill

可选：--skills-dir <目录>，将 Skill 放到其他 Agent 的技能目录。
默认目录：$DSH_HOME/skills；未设置 DSH_HOME 时使用 ~/.dsh/skills。
已有相同 Skill 会跳过；不同内容不会被覆盖。`);
} else {
  try {
    if (args[0] !== 'install-skill') throw new Error('未知命令，请运行 dsh-bigfish --help');
    let skillsDir;
    if (args.length > 1) {
      if (args.length !== 3 || args[1] !== '--skills-dir' || !args[2] || args[2].startsWith('--')) {
        throw new Error('用法：dsh-bigfish install-skill [--skills-dir <目录>]');
      }
      skillsDir = args[2];
    }
    const result = await installSkill(skillsDir);
    console.log(`${result.installed ? '已安装' : '已是相同版本'}：${result.path}`);
    console.log('在 DSH 中新建会话，然后说：用 $dsh-bigfish-pet-maker 制作角色包，或给已有角色增加动作。');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
