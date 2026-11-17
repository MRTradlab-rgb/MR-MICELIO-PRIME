package com.mr.miceliocompanion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.concurrent.thread

class FloatingCompanionService : Service(), TextToSpeech.OnInitListener {
    private lateinit var wm: WindowManager
    private lateinit var bubble: TextView
    private var panel: LinearLayout? = null
    private lateinit var bubbleParams: WindowManager.LayoutParams
    private var panelParams: WindowManager.LayoutParams? = null
    private var tts: TextToSpeech? = null
    private val handler = Handler(Looper.getMainLooper())
    private var expanded = false
    private var targetX = 18
    private var targetY = 240
    private var lastTargetAt = 0L
    private var userDragging = false

    // Movimento autônomo local: não depende de chamadas à IA a cada quadro.
    // Quando a visão contextual fornecer coordenadas, elas poderão substituir estes alvos.
    private val drift = object : Runnable {
        override fun run() {
            if (!expanded && !userDragging && ::bubbleParams.isInitialized) {
                val display = resources.displayMetrics
                val maxX = (display.widthPixels - 76).coerceAtLeast(0)
                val maxY = (display.heightPixels - 150).coerceAtLeast(80)
                val now = android.os.SystemClock.uptimeMillis()
                if (now - lastTargetAt > 4200L) {
                    val safeTop = (display.heightPixels * 0.12f).toInt()
                    val safeBottom = (display.heightPixels * 0.78f).toInt()
                    targetX = (24..maxX.coerceAtLeast(24)).random()
                    targetY = (safeTop..safeBottom.coerceAtLeast(safeTop + 1)).random()
                    lastTargetAt = now
                }
                val dx = targetX - bubbleParams.x
                val dy = targetY - bubbleParams.y
                bubbleParams.x += (dx * 0.055f).toInt().let { if (it == 0 && dx != 0) dx.sign() else it }
                bubbleParams.y += (dy * 0.055f).toInt().let { if (it == 0 && dy != 0) dy.sign() else it }
                bubbleParams.x = bubbleParams.x.coerceIn(0, maxX)
                bubbleParams.y = bubbleParams.y.coerceIn(0, maxY)
                try { wm.updateViewLayout(bubble, bubbleParams) } catch (_: Exception) {}
            }
            handler.postDelayed(this, 45)
        }
    }

    private fun Int.sign(): Int = if (this > 0) 1 else -1

    override fun onCreate() {
        super.onCreate()
        startForeground(71, buildNotification())
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        tts = TextToSpeech(this, this)
        createBubble()
        handler.postDelayed(drift, 90)
    }

    private fun buildNotification(): Notification {
        val channelId = "micelio_companion"
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(channelId, "Micélio Companion", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channelId) else Notification.Builder(this)
        return builder.setContentTitle("Micélio Companion ativo")
            .setContentText("Toque no cogumelo para conversar. Toque em Parar no app para encerrar.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true).build()
    }

    private fun overlayParams(width: Int, height: Int): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
        return WindowManager.LayoutParams(width, height, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.START }
    }

    private fun createBubble() {
        bubble = TextView(this).apply {
            text = "🍄"
            textSize = 34f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.TRANSPARENT)
            setOnClickListener { togglePanel() }
            setOnTouchListener(object : android.view.View.OnTouchListener {
                private var sx = 0f; private var sy = 0f; private var ox = 0; private var oy = 0
                override fun onTouch(v: android.view.View, event: MotionEvent): Boolean {
                    when (event.action) {
                        MotionEvent.ACTION_DOWN -> { sx = event.rawX; sy = event.rawY; ox = bubbleParams.x; oy = bubbleParams.y; userDragging = true; return true }
                        MotionEvent.ACTION_MOVE -> {
                            bubbleParams.x = ox + (event.rawX - sx).toInt()
                            bubbleParams.y = oy + (event.rawY - sy).toInt()
                            try { wm.updateViewLayout(bubble, bubbleParams) } catch (_: Exception) {}
                            return true
                        }
                        MotionEvent.ACTION_UP -> {
                            val moved = kotlin.math.abs(event.rawX - sx) + kotlin.math.abs(event.rawY - sy) > 18
                            if (!moved) performClick()
                            userDragging = false
                            targetX = bubbleParams.x; targetY = bubbleParams.y
                            lastTargetAt = android.os.SystemClock.uptimeMillis()
                            return true
                        }
                    }
                    return false
                }
            })
        }
        bubbleParams = overlayParams(76, 76).apply { x = 18; y = 240 }
        wm.addView(bubble, bubbleParams)
    }

    private fun togglePanel() {
        if (expanded) { closePanel(); return }
        expanded = true
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 20, 24, 20)
            setBackgroundColor(Color.rgb(18, 38, 34))
        }
        box.addView(TextView(this).apply { text = "🍄 Micélio Companion"; textSize = 19f; setTextColor(Color.WHITE) })
        val answer = TextView(this).apply { text = "Oi! Estou aqui. Pode falar ou escrever comigo."; setTextColor(Color.WHITE); textSize = 15f; setPadding(0, 16, 0, 12) }
        box.addView(answer)
        val input = EditText(this).apply { hint = "Digite sua mensagem"; setTextColor(Color.WHITE); setHintTextColor(Color.LTGRAY) }
        box.addView(input)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(Button(this).apply { text = "Enviar"; setOnClickListener {
            val msg = input.text.toString().trim()
            if (msg.isNotEmpty()) { answer.text = "Pensando…"; askPrime(msg) { answer.text = it; tts?.speak(it, TextToSpeech.QUEUE_FLUSH, null, "micelio-reply") } }
        } })
        row.addView(Button(this).apply { text = "Falar"; setOnClickListener { startVoice(answer, input) } })
        row.addView(Button(this).apply { text = "Fechar"; setOnClickListener { closePanel() } })
        box.addView(row)
        panel = box
        panelParams = overlayParams((resources.displayMetrics.widthPixels - 36).coerceAtLeast(280), WindowManager.LayoutParams.WRAP_CONTENT).apply {
            x = 18; y = 330; flags = WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
        }
        wm.addView(box, panelParams)
    }

    private fun closePanel() {
        expanded = false
        panel?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        panel = null; panelParams = null
    }

    private fun startVoice(answer: TextView, input: EditText) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            answer.text = "O reconhecimento de voz não está disponível neste aparelho."
            return
        }
        try {
            speechRecognizer?.destroy()
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
                setRecognitionListener(object : android.speech.RecognitionListener {
                    override fun onReadyForSpeech(params: android.os.Bundle?) { answer.text = "Pode falar…" }
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {}
                    override fun onError(error: Int) { answer.text = "Não consegui entender. Tente novamente." }
                    override fun onResults(results: android.os.Bundle?) {
                        val said = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                        input.setText(said)
                        if (said.isNotBlank()) { answer.text = "Entendi: $said"; askPrime(said) { answer.text = it; tts?.speak(it, TextToSpeech.QUEUE_FLUSH, null, "micelio-voice") } }
                    }
                    override fun onPartialResults(partialResults: android.os.Bundle?) {}
                    override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
                })
                startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
                })
            }
        } catch (_: SecurityException) { answer.text = "Autorize o microfone nas configurações do Android." }
    }

    private fun askPrime(message: String, done: (String) -> Unit) {
        thread {
            var reply = "Não consegui conectar ao Micélio Prime agora."
            try {
                val url = URL("https://mr-micelio-prime.felipe-revolt.workers.dev/chat")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"; connectTimeout = 12000; readTimeout = 20000
                    doOutput = true; setRequestProperty("Content-Type", "application/json")
                }
                val payload = JSONObject().put("message", message).put("context", JSONObject()
                    .put("client", "Micelio Companion Android").put("version", "0.1.0")).toString()
                conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
                val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
                val body = stream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)
                reply = json.optString("reply", json.optString("error", reply))
                conn.disconnect()
            } catch (_: Exception) {}
            handler.post { done(reply) }
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) tts?.language = Locale("pt", "BR")
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        speechRecognizer?.destroy()
        tts?.stop(); tts?.shutdown()
        closePanel()
        if (::bubble.isInitialized) try { wm.removeView(bubble) } catch (_: Exception) {}
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
