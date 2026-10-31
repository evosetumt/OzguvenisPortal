/**
 * Varsayılan süreç tanımları (seed ile sürüm 1 olarak yüklenir, tasarımcıdan değiştirilebilir).
 * Masraf onayı: docs/PLAN.md Bölüm 6'daki kural.
 */

const shape = (id: string, x: number, y: number, w: number, h: number, marker = false) =>
  `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${marker ? ' isMarkerVisible="true"' : ''}><dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}" /></bpmndi:BPMNShape>`;
const edge = (id: string, pts: [number, number][]) =>
  `      <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${pts.map(([x, y]) => `<di:waypoint x="${x}" y="${y}" />`).join('')}</bpmndi:BPMNEdge>`;

export const EXPENSE_APPROVAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:portal="http://ozguvenis.local/portal" id="Defs_expense" targetNamespace="http://ozguvenis.local/bpmn">
  <bpmn:process id="expense_approval" name="Masraf onayı" isExecutable="true">
    <bpmn:startEvent id="Start" name="Masraf gönderildi"><bpmn:outgoing>F_start</bpmn:outgoing></bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gw_Limit" name="Eşik altında mı?" default="F_limit_no"><bpmn:incoming>F_start</bpmn:incoming><bpmn:outgoing>F_limit_yes</bpmn:outgoing><bpmn:outgoing>F_limit_no</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:serviceTask id="Task_Auto" name="Otomatik onay" portal:handler="expense.autoApprove"><bpmn:incoming>F_limit_yes</bpmn:incoming><bpmn:outgoing>F_auto_acc</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="Task_Manager" name="Yönetici onayı" portal:assignee="manager" portal:decisions="approved,rejected"><bpmn:incoming>F_limit_no</bpmn:incoming><bpmn:outgoing>F_mgr_rec</bpmn:outgoing></bpmn:userTask>
    <bpmn:serviceTask id="Task_RecordMgr" name="Yönetici kararını işle" portal:handler="expense.recordDecision" portal:args="manager"><bpmn:incoming>F_mgr_rec</bpmn:incoming><bpmn:outgoing>F_rec_gw</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:exclusiveGateway id="Gw_Mgr" name="Yönetici onayladı mı?" default="F_mgr_no"><bpmn:incoming>F_rec_gw</bpmn:incoming><bpmn:outgoing>F_mgr_yes</bpmn:outgoing><bpmn:outgoing>F_mgr_no</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:endEvent id="End_MgrRejected" name="Reddedildi"><bpmn:incoming>F_mgr_no</bpmn:incoming></bpmn:endEvent>
    <bpmn:userTask id="Task_Accounting" name="Muhasebe onayı" portal:assignee="department:Muhasebe" portal:decisions="approved,rejected"><bpmn:incoming>F_auto_acc</bpmn:incoming><bpmn:incoming>F_mgr_yes</bpmn:incoming><bpmn:outgoing>F_acc_rec</bpmn:outgoing></bpmn:userTask>
    <bpmn:serviceTask id="Task_RecordAcc" name="Muhasebe kararını işle" portal:handler="expense.recordDecision" portal:args="accounting"><bpmn:incoming>F_acc_rec</bpmn:incoming><bpmn:outgoing>F_acc_gw</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:exclusiveGateway id="Gw_Acc" name="Muhasebe onayladı mı?" default="F_acc_no"><bpmn:incoming>F_acc_gw</bpmn:incoming><bpmn:outgoing>F_acc_yes</bpmn:outgoing><bpmn:outgoing>F_acc_no</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:endEvent id="End_AccRejected" name="Reddedildi"><bpmn:incoming>F_acc_no</bpmn:incoming></bpmn:endEvent>
    <bpmn:userTask id="Task_Payment" name="Ödeme" portal:assignee="department:Muhasebe" portal:decisions="paid"><bpmn:incoming>F_acc_yes</bpmn:incoming><bpmn:outgoing>F_pay_rec</bpmn:outgoing></bpmn:userTask>
    <bpmn:serviceTask id="Task_RecordPay" name="Ödemeyi işle" portal:handler="expense.recordDecision" portal:args="payment"><bpmn:incoming>F_pay_rec</bpmn:incoming><bpmn:outgoing>F_end</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:endEvent id="End_Paid" name="Ödendi"><bpmn:incoming>F_end</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F_start" sourceRef="Start" targetRef="Gw_Limit" />
    <bpmn:sequenceFlow id="F_limit_yes" name="Evet" sourceRef="Gw_Limit" targetRef="Task_Auto"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${amountTry &lt;= settings.expense.autoApproveLimit}</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="F_limit_no" name="Hayır" sourceRef="Gw_Limit" targetRef="Task_Manager" />
    <bpmn:sequenceFlow id="F_auto_acc" sourceRef="Task_Auto" targetRef="Task_Accounting" />
    <bpmn:sequenceFlow id="F_mgr_rec" sourceRef="Task_Manager" targetRef="Task_RecordMgr" />
    <bpmn:sequenceFlow id="F_rec_gw" sourceRef="Task_RecordMgr" targetRef="Gw_Mgr" />
    <bpmn:sequenceFlow id="F_mgr_yes" name="Onay" sourceRef="Gw_Mgr" targetRef="Task_Accounting"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${decision == 'approved'}</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="F_mgr_no" name="Red" sourceRef="Gw_Mgr" targetRef="End_MgrRejected" />
    <bpmn:sequenceFlow id="F_acc_rec" sourceRef="Task_Accounting" targetRef="Task_RecordAcc" />
    <bpmn:sequenceFlow id="F_acc_gw" sourceRef="Task_RecordAcc" targetRef="Gw_Acc" />
    <bpmn:sequenceFlow id="F_acc_yes" name="Onay" sourceRef="Gw_Acc" targetRef="Task_Payment"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${decision == 'approved'}</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="F_acc_no" name="Red" sourceRef="Gw_Acc" targetRef="End_AccRejected" />
    <bpmn:sequenceFlow id="F_pay_rec" sourceRef="Task_Payment" targetRef="Task_RecordPay" />
    <bpmn:sequenceFlow id="F_end" sourceRef="Task_RecordPay" targetRef="End_Paid" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_expense">
    <bpmndi:BPMNPlane id="Plane_expense" bpmnElement="expense_approval">
${[
  shape('Start', 152, 202, 36, 36),
  shape('Gw_Limit', 245, 195, 50, 50, true),
  shape('Task_Auto', 350, 60, 100, 80),
  shape('Task_Manager', 350, 180, 100, 80),
  shape('Task_RecordMgr', 500, 180, 100, 80),
  shape('Gw_Mgr', 655, 195, 50, 50, true),
  shape('End_MgrRejected', 662, 332, 36, 36),
  shape('Task_Accounting', 760, 60, 100, 80),
  shape('Task_RecordAcc', 910, 60, 100, 80),
  shape('Gw_Acc', 1065, 75, 50, 50, true),
  shape('End_AccRejected', 1072, 202, 36, 36),
  shape('Task_Payment', 1170, 60, 100, 80),
  shape('Task_RecordPay', 1320, 60, 100, 80),
  shape('End_Paid', 1472, 82, 36, 36),
  edge('F_start', [[188, 220], [245, 220]]),
  edge('F_limit_yes', [[270, 195], [270, 100], [350, 100]]),
  edge('F_limit_no', [[295, 220], [350, 220]]),
  edge('F_auto_acc', [[450, 100], [760, 100]]),
  edge('F_mgr_rec', [[450, 220], [500, 220]]),
  edge('F_rec_gw', [[600, 220], [655, 220]]),
  edge('F_mgr_yes', [[680, 195], [680, 120], [760, 120]]),
  edge('F_mgr_no', [[680, 245], [680, 332]]),
  edge('F_acc_rec', [[860, 100], [910, 100]]),
  edge('F_acc_gw', [[1010, 100], [1065, 100]]),
  edge('F_acc_yes', [[1115, 100], [1170, 100]]),
  edge('F_acc_no', [[1090, 125], [1090, 202]]),
  edge('F_pay_rec', [[1270, 100], [1320, 100]]),
  edge('F_end', [[1420, 100], [1472, 100]]),
].join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

/** Tasarımcıda yeni süreç için başlangıç şablonu. */
export const EMPTY_PROCESS_XML = (key: string, name: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:portal="http://ozguvenis.local/portal" id="Defs_${key}" targetNamespace="http://ozguvenis.local/bpmn">
  <bpmn:process id="${key}" name="${name.replace(/[<>&"]/g, '')}" isExecutable="true">
    <bpmn:startEvent id="Start" name="Başla" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_${key}">
    <bpmndi:BPMNPlane id="Plane_${key}" bpmnElement="${key}">
${shape('Start', 152, 102, 36, 36)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
