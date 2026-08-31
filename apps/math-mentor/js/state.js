const ERROR_TYPE_LABEL = { none: "无", concept: "概念理解错误", calculation: "计算失误", misread: "审题错误", method: "方法选择错误", prereq: "前置知识不足", code: "代码实现错误" };
const state = {
  domain: "analysis",
  view: "home",
  cat: null,
  skills: [], mastery: {}, diagnosis: {}, settings: {}, stats: {},
  activeSkill: null,
  lesson: null, lessonDone: false,
  lessonEls: null,
  sections: [], sectionIdx: 0, sectionAll: false, legacyLesson: null, lessonViewMode: "sections",
  outline: [], genBusy: false,
  quiz: [], quizIdx: 0, quizResults: [], quizScope: null,
  diag: null,
  wrongList: [], dueList: [],
  customTopics: [], customEditing: null,
  loaded: false
};

export function skillById(id) { return state.skills.find(s => s.id === id); }
export { ERROR_TYPE_LABEL, state };
