package com.mr.miceliocompanion

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.content.pm.PackageManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
        }
        root.addView(TextView(this).apply {
            text = "🍄 MICÉLIO COMPANION\n\nSeu companheiro digital, dentro da plataforma e no Android."
            textSize = 22f
        })
        root.addView(TextView(this).apply {
            text = "\nProtótipo 0.1 — bolha flutuante, conversa com o Micélio Prime e voz experimental. Acessibilidade e proteção avançada ainda não estão ativadas nesta versão."
            textSize = 15f
        })
        root.addView(Button(this).apply {
            text = "ATIVAR COGUMELO FLUTUANTE"
            setOnClickListener { requestOverlayAndStart() }
        })
        root.addView(Button(this).apply {
            text = "PARAR ASSISTENTE"
            setOnClickListener { stopService(Intent(this@MainActivity, FloatingCompanionService::class.java)) }
        })
        setContentView(root)
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 40)
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 41)
        }
    }

    private fun requestOverlayAndStart() {
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
            startActivity(intent)
            Toast.makeText(this, "Autorize 'Exibir sobre outros apps' e toque novamente.", Toast.LENGTH_LONG).show()
            return
        }
        val intent = Intent(this, FloatingCompanionService::class.java)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent) else startService(intent)
        Toast.makeText(this, "Micélio Companion iniciado.", Toast.LENGTH_SHORT).show()
    }
}
