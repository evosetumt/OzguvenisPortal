/**
 * bpmn-js için "portal" ad alanı tanımı: sunucudaki motorun okuduğu özel öznitelikler.
 * userTask: portal:assignee, portal:dueHours, portal:decisions · serviceTask: portal:handler, portal:args
 */
export const portalModdle = {
  name: 'Portal',
  uri: 'http://ozguvenis.local/portal',
  prefix: 'portal',
  xml: { tagAlias: 'lowerCase' },
  associations: [],
  types: [
    {
      name: 'UserTaskProps',
      extends: ['bpmn:UserTask'],
      properties: [
        { name: 'assignee', isAttr: true, type: 'String' },
        { name: 'dueHours', isAttr: true, type: 'String' },
        { name: 'decisions', isAttr: true, type: 'String' },
      ],
    },
    {
      name: 'ServiceTaskProps',
      extends: ['bpmn:ServiceTask'],
      properties: [
        { name: 'handler', isAttr: true, type: 'String' },
        { name: 'args', isAttr: true, type: 'String' },
      ],
    },
  ],
};
