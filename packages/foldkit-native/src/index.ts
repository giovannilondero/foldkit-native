import { claimHost, type Engine } from '@ng-native/fabric'

/**
 * S2 placeholder: draws a full-height view with one line of text straight on the Fabric Engine
 * and commits it. It proves the dev client renders through `@ng-native/fabric` with no React in
 * the render path. The Fabric Platform and the mount (#14) replace it.
 */
export const mountSplash = (engine: Engine, label: string): void => {
  const host = engine.createElement('view')
  engine.setProp(host, 'style', {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  })
  const text = engine.createElement('text')
  engine.setProp(text, 'style', { fontSize: 24 })
  engine.appendChild(text, engine.createText(label))
  claimHost(host)
  claimHost(text)
  engine.appendChild(host, text)
  engine.appendChild(engine.root, host)
  engine.commit()
}
