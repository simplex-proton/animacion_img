Plan de acción: semántica emoticono en ojos y boca
Fase 1 · Validación y aprobación

Estado de cada adecuación

"Entregado" significa que el código ya está escrito en esta conversación y falta aplicarlo y verificarlo. "Propuesta" significa que solo existe la idea, sin código.

ID	Adecuación	Archivos	Estado	Riesgo	Decisión requerida
B1	Boca caricatura plana: 22 slots, dientes y lengua como planos de color, w 36	mouth.js (nuevo), geometry.js, features.js, engine.js, nimbo.js, twinkle.js	Entregado	Medio: toca el resorte de la boca	Aprobar tamaño y estilo plano
B2	Auto-ajuste anti-colisión boca ↔ ojos/gafas	features.js, mouth.js	Entregado	Bajo	Aprobar reducción uniforme
B3	Remapeo de boca en las emociones 01, 07, 10, 12, 13, 15, 17, 19, 33 y 34	emotions.js, emotions.json, schema, seed-to-json.js	Entregado	Bajo	Aprobar el mapeo
B4	Visemas en la emoción 39 y setMouthLevel	engine.js, emotions.js	Propuesta	Medio	Priorizar
O1	Corrección de slope asimétrico	geometry.js	Entregado	Cambia el aspecto de 6 slots	Aprobar tras comparar antes y después
O2	Slots squeeze y cry	geometry.js	Entregado	Bajo	Aprobar
O3	Esclerótica, iris y ojo bean con volumen	render.js	Propuesta	Medio: rendimiento en miniaturas	Aprobar dirección artística
O4	Párpados reales y acople con la mirada	render.js, engine.js	Propuesta	Medio	Priorizar
O5	Pupila dilatable, micro-movimientos, humedad, follow-through	render.js, engine.js, fx.js	Propuesta	Bajo-Medio	Priorizar
P1	Rubor de Twinkle dx 44 y pool de la emoción 19	twinkle.js, emotions.js	Entregado	Bajo	Aprobar

Invariantes que no se tocan: el contrato de IDs de emoción, el número de puntos de los anillos (96 / 48 / 24), la API pública (create, setEmotion, handleAIMessage) y el protocolo emotionId.

Puerta de aprobación 1

Técnico: B1, B2, B3 y O1 aplicados en una rama, sin errores de consola, con seed-to-json --check en verde.
Artístico: comparativa antes y después (Fase 2.0) de las 32 emociones en ambos personajes.
Solo tras el visto bueno se pasa a O3–O5.
Fase 2 · Adecuación geométrica

Se trabaja en la rama feat/emoticon-semantics. El rollback es el tag pre-emoticon.

Paso	Tarea	Verificación
2.0	Línea base: tag pre-emoticon. Capturas de 32 emociones × 2 personajes × variantes. Se toman en reposo y con mirada extrema (±1, ±1), a 64 px y a 240 px. Se guardan en qa/baseline/.	Existen las capturas y están versionadas
2.1	Crear tools/face-audit.html, que mide por emoción y personaje: hueco boca ↔ ojo/gafas, simetría de ojos, proporciones R1–R4 (Fase 4) y contención en el viewBox.	Devuelve un informe JSON y pasa/falla
2.2	Corregir slope en lens() y su comentario. Revisar los 6 slots afectados en ring-editor.	Asimetría ≤ 0.5 px en todos los slots; aprobación artística
2.3	Integrar mouth.js: orden de carga, parches F1/F2 y E0–E5, w 36 en ambos personajes.	Las 22 bocas se renderizan; transiciones sin saltos
2.4	Auto-ajuste de la boca en features.js.	Hueco ≥ 5 px en las 32 emociones, incluida la mirada hacia abajo
2.5	Datos: mapeo de mouth, mouthSY de las emociones 13 y 39, pool de la 19, enum del schema. Limpiar las 4 líneas de diff al inicio de seed-to-json.js.	node tools/seed-to-json.js --check y luego regenerar data/emotions.json (boot() lo carga y pisa el seed)
2.6	Slots squeeze y cry. Actualizar los docs de 20 a 22 slots.	Aparecen en ring-editor; la emoción 50 de prueba se renderiza
2.7	Proporciones por personaje, con los rangos de la Fase 4. Rubor de Twinkle dx 44.	R1–R4 en verde
2.8	Volumen en ojos (O3): degradado esférico en la esclerótica, sombra de párpado, ojo bean con overlay. Sin feGaussianBlur. Debe respetar el modo boceto (--sketch-ink) y lite.	60 fps con 32 miniaturas; modo boceto intacto
2.9	Párpados y pupila (O4, O5).	Criterios de la Fase 3
2.10	DESIGN-PROVENANCE.md: añadir v1.9 y v1.9.1 antes del §10 actual y renumerar, porque hoy hay colisión con el §11 "Añadir nuevos personajes". Actualizar la "Declaración de independencia" del §1 para decir que la referencia es semántica (categorías de expresión), sin geometría.	Entrada fechada, con parámetros
Fase 3 · Animación y expresividad

Principios

Principio	Regla	Medida
Boca como foco de lectura	La silueta de la boca sola, en monocromo a 32 px, distingue la familia emocional	Prueba de silueta (Fase 4)
Ojos para valencia y energía	La apertura marca la energía y la pendiente simétrica marca el signo (exterior alto = firmeza, exterior bajo = tristeza)	Simetría ≤ 0.5 px
Sonrisa que involucra toda la cara	grin, laugh y smile suben el rubor 0.15 y bajan los ojos a scaleY 0.92	Revisión visual
Asimetría solo con intención	Solo en confusión, duda y sonrisa ladeada (emociones 11, 19, 20)	Lista cerrada
Anticipación y rebote	Antes de cambiar de emoción, ojos a scaleX 0.96 durante 80 ms. El parpadeo cierra en 60–80 ms y abre con rebote.	Cronometraje
Escalonado por capas	Rubor y cejas, luego ojos (+70 ms), luego boca (+150 ms). Ya existe en layered.	Se conserva
Follow-through	Los ojos llegan 60–90 ms tarde al movimiento del cuerpo	Revisión en bounce()
Presupuesto de amplitud	mouthSY en estado fijo ≤ 1.15 y pulso ≤ 0.3	face-audit
Identidad por personaje	Nimbo: lento, pausas largas. Twinkle: vivo, gafas, parpadeo breve.	Prueba de identidad

Matriz semántica. Solo toma el significado de cada familia, sin ninguna geometría de glifos.

Familia	Emociones	Ojos (slot)	Boca (slot)	Apoyo
Alegría	10, 19, 33	happy, happy2; en la 19, squint2	laugh, smirk, grinTeeth	Rubor, rebote del cuerpo
Sorpresa y miedo	13, 17, 34	wide, wide2	scream, tremble, grimace	Cejas arriba, anticipación de 150 ms
Tristeza y desánimo	12, 18, 38	sad, sleepy, squint	sad, frown, flat	Mirada baja, cuerpo hacia abajo
Enfado y firmeza	21, 16, 32	angry, angry2	frown, flat	Cejas, color @angry
Confusión y duda	11, 20	squint, calm	wavy	Asimetría de tamaño y altura
Timidez	14	shy	pout	Rubor, mirada lateral
Cansancio y sueño	00, 06, 15, 41	closed, sleepy	flat, yawn	Respiración lenta
Atención y escucha	02, 03, 30, 35, 37	calm, listen, scan2	smile, dot, o	Mirada patrulla
Habla y proceso	39, 40, 36	scan, scan2	open con visemas	setMouthLevel
Llanto y lengua	personalizadas 50+	cry, squeeze, happy	sob, laughTears, tongue, yum	Sin emoción de catálogo todavía
Fase 4 · Criterios de aceptación

Los umbrales son propuestos y ajustables en la puerta 1.

A. Técnicos (automáticos, face-audit)

ID	Métrica	Umbral
R1	Ancho de boca / separación centro a centro de los ojos	0.55–0.75
R2	Hueco boca ↔ ojo/gafas, en las 32 emociones y con mirada extrema	≥ 5 px
R3	Altura máxima de la boca / altura del ojo	≤ 1.2
R4	Hueco rubor ↔ borde de la boca	≥ 4 px
S1	Asimetría de pendiente izquierda y derecha, por slot	≤ 0.5 px
S2	Contención en el viewBox 240×240	100 %
S3	Anillos con 48 y 24 puntos y sin auto-intersección	100 %
P1	Rendimiento con 32 miniaturas más el escenario principal	≥ 55 fps
P2	Errores de consola y seed-to-json --check	0 y verde

B. Empatía y legibilidad (pruebas con personas, n ≥ 20)

Prueba	Método	Umbral
Reconocimiento	12 emociones estáticas a 64 px y 32 px, con elección forzada entre etiquetas	≥ 85 % (≥ 70 % en sutiles: 11, 19, 20)
Mejora frente a línea base	Mismo test con las capturas de la 2.0	+15 puntos
Confianza y empatía	Escala Likert 1–5 tras ver una secuencia de 8 emociones	≥ 4.0 y superior a la línea base
Silueta	Solo la boca, en monocromo a 32 px	≥ 8 de 12 familias distinguidas
Identidad	Distinguir Nimbo y Twinkle entre sí y frente a emoji genéricos	≥ 90 %

C. No-copia y legal (checklist firmado)

 Ningún path, coordenada ni recurso de ninguna fuente de referencia está en el repositorio. Toda forma se genera con geometry.js o mouth.js.
 El PDF de referencia queda fuera del repositorio. Sus propios términos prohíben incorporarlo a un producto.
 No se usaron imágenes de emoji de terceros, ni como entrada de generación de imágenes (el §1.7 de provenance menciona texto-a-imagen para los bocetos).
 Revisión por pares: ningún slot de ojo o boca es trazable a un set comercial (Apple, Google, Twemoji u otros).
 DESIGN-PROVENANCE.md actualizado con fecha y parámetros, y con la declaración de referencia solo semántica.
 Aprobación legal para la licencia comercial (LICENSE-COMMERCIAL.md). Esto es una guía técnica, no asesoría jurídica.
Cronograma sugerido
Sprint	Contenido	Salida
1	Pasos 2.0–2.7	Puerta 1 aprobada
2	Pasos 2.8–2.9 (volumen, párpados, pupila)	Pruebas A y B
3	Fase 3 completa, visemas y mezcla de emociones	Checklist C firmado