import { useEffect, useRef, useState } from 'react';
import Viewer from 'bpmn-js/lib/NavigatedViewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import type { ProcessInstanceDetail } from '../../lib/types-workflow';

type Any = any;

/** Süreç örneğini diyagram üzerinde gösterir: tamamlanan adımlar yeşil, bekleyen mavi, hata kırmızı. */
export function InstanceViewer({ xml, highlight }: { xml: string; highlight: ProcessInstanceDetail['highlight'] }) {
  const host = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!host.current) return;
    const v: Any = new Viewer({ container: host.current });
    v.importXML(xml).then(() => {
      const canvas = v.get('canvas');
      const registry = v.get('elementRegistry');
      const done = new Set(highlight.completed);
      const active = new Set(highlight.active);
      for (const id of done) if (registry.get(id)) canvas.addMarker(id, 'wf-done');
      for (const id of active) if (registry.get(id)) canvas.addMarker(id, 'wf-active');
      if (highlight.failed && registry.get(highlight.failed)) canvas.addMarker(highlight.failed, 'wf-failed');
      // Geçilen akışlar: kaynağı tamamlanmış ve hedefi girilmiş (tamamlanan/bekleyen/hatalı) bağlantılar
      const reached = new Set([...done, ...active, ...(highlight.failed ? [highlight.failed] : [])]);
      for (const c of registry.filter((e: Any) => e.type === 'bpmn:SequenceFlow')) {
        if (done.has(c.source.id) && reached.has(c.target.id)) canvas.addMarker(c.id, 'wf-done');
      }
      canvas.zoom('fit-viewport', 'auto');
    }).catch((e: Error) => setErr(e.message));
    return () => v.destroy();
  }, [xml, highlight]);

  return (
    <>
      {err && <p className="error">{err}</p>}
      <div className="bpmn-canvas viewer" ref={host} />
      <div className="legend">
        <span><i style={{ background: '#d1fae5', border: '1px solid #059669' }} />Tamamlandı</span>
        <span><i style={{ background: '#dbeafe', border: '1px solid #2563eb' }} />Bekliyor</span>
        <span><i style={{ background: '#fee2e2', border: '1px solid #dc2626' }} />Hata</span>
      </div>
    </>
  );
}
