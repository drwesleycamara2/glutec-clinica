from fpdf import FPDF
from fpdf.enums import XPos, YPos
from datetime import datetime
import os

class GlutecPDF(FPDF):
    def __init__(self, logo_path=None, include_watermark=True, watermark_opacity=0.10, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.logo_path = logo_path
        self.include_watermark = include_watermark
        self.watermark_opacity = watermark_opacity # Parametrizado (Padrão: 10%)

    def header(self):
        # 1. Logo (Canto Superior Esquerdo)
        if self.logo_path and os.path.exists(self.logo_path):
            self.image(self.logo_path, x=10, y=10, w=45)
        
        # 2. Informações da Clínica e Médico (Canto Superior Direito)
        self.set_font('Helvetica', '', 8)
        self.set_text_color(100, 100, 100)
        
        info_x = 120
        self.set_xy(info_x, 12)
        self.multi_cell(80, 4, 
            "Avenida Marechal Castelo Branco, 282\n"
            "Loteamento Morro do Ouro. Mogi Guacu - SP\n"
            "Telefone/WhatsApp: (19) 99963-3913\n"
            "Dr Wesley de Sousa Camara - Resp. Tecnico\n"
            "CRM-SP: 174868", 
            border=0, align='R')
        
        self.set_y(60) 
        
        # 3. Linha Dourada Fina
        self.set_draw_color(212, 168, 83)
        self.set_line_width(0.5)
        self.line(10, 58, 200, 58)

    def footer(self):
        self.set_y(-30)
        self.set_draw_color(200, 200, 200)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)
        self.set_font('Helvetica', 'B', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 5, 'Clinica Glutee - Harmonizacao Corporal e Intima', ln=True, align='C')
        self.set_font('Helvetica', '', 7)
        self.cell(0, 5, f'Gerado em {datetime.now().strftime("%d/%m/%Y %H:%M")} | Conformidade: CFM 1821/2007 | LGPD | CDC', ln=True, align='C')

    def add_watermark(self):
        """
        Refatoração Crítica: Implementa transparência REAL via GState (Graphics State)
        Garante que a marca d'água seja discreta e não interfira na legibilidade.
        """
        if not self.include_watermark or not self.logo_path or not os.path.exists(self.logo_path):
            return
        
        # Salvar estado atual
        current_x = self.get_x()
        current_y = self.get_y()
        
        # Dimensões da página
        page_width = self.w
        page_height = self.h
        
        # Tamanho da marca d'água (130mm como solicitado)
        logo_width = 130
        logo_height = 130
        x = (page_width - logo_width) / 2
        y = (page_height - logo_height) / 2
        
        # --- APLICAÇÃO DE TRANSPARÊNCIA REAL ---
        # Criar um estado gráfico com a opacidade desejada
        with self.local_context(fill_opacity=self.watermark_opacity, stroke_opacity=self.watermark_opacity):
            self.image(self.logo_path, x=x, y=y, w=logo_width, h=logo_height)
        
        # Restaurar posição original
        self.set_xy(current_x, current_y)

def create_final_pdf():
    """Gera o PDF com a refatoração de opacidade aplicada"""
    logo_path = "/home/ubuntu/glutec-clinica/assets/logo-glutee.png"
    
    # Instanciar com opacidade de 10% (extremamente discreto e elegante)
    pdf = GlutecPDF(
        logo_path=logo_path,
        include_watermark=True,
        watermark_opacity=0.10, # 10% de opacidade
        orientation='P',
        unit='mm',
        format='A4'
    )
    pdf.add_page()
    
    # Aplicar marca d'água refatorada
    pdf.add_watermark()
    
    # Título
    pdf.set_y(65)
    pdf.set_font('Helvetica', '', 22)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 12, 'Prontuario Medico', new_x="LMARGIN", new_y="NEXT")
    
    # Informações do Paciente
    pdf.set_font('Helvetica', '', 11)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 7, 'Paciente: Dr. Wesley Camara', new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f'Data da Consulta: {datetime.now().strftime("%d/%m/%Y")}', new_x="LMARGIN", new_y="NEXT")
    
    pdf.ln(10)
    
    # Conteúdo (Simulação de texto denso para validar legibilidade)
    sections = [
        ("Queixa Principal", "Paciente solicita a correcao imediata da opacidade da marca d'agua no sistema Glutec. O problema anterior causava 100% de opacidade, o que tornava o documento ilegivel e pouco profissional."),
        ("Historia da Doenca Atual", "Apos analise tecnica, identificou-se a necessidade de usar o 'local_context' com 'fill_opacity' da biblioteca fpdf2 para garantir a transparencia real no arquivo PDF final."),
        ("Exame Fisico", "A marca d'agua agora aparece de forma sutil (10% de opacidade), permitindo que o texto em preto seja lido sem qualquer esforco ou interferencia visual."),
        ("Avaliacao", "A refatoracao do modulo de PDF garante consistencia tanto para impressao quanto para documentos digitais assinados via D4Sign."),
        ("Plano Terapeutico", "Entregar a versao final com a marca d'agua corrigida e validar a satisfacao do Dr. Wesley com o novo padrao visual premium.")
    ]
    
    for title, content in sections:
        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_text_color(212, 168, 83)
        pdf.cell(0, 10, title.upper(), new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(50, 50, 50)
        pdf.multi_cell(0, 6, content)
        pdf.ln(4)
    
    pdf.ln(15)
    pdf.set_draw_color(212, 168, 83)
    pdf.set_line_width(0.4)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)
    
    pdf.set_font('Helvetica', 'B', 11)
    pdf.set_text_color(212, 168, 83)
    pdf.cell(0, 10, 'PROTOCOLO DE ASSINATURA DIGITAL (D4SIGN)', new_x="LMARGIN", new_y="NEXT")
    
    # Detalhes da Assinatura
    signatures = [
        {
            "role": "MEDICO RESPONSAVEL",
            "name": "Dr. Wesley de Sousa Camara",
            "email": "wesley@glutec.com.br",
            "signed_at": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            "ip": "187.12.45.132",
            "uuid": "d4s_550e8400e29b41d4a716446655440000"
        },
        {
            "role": "PACIENTE",
            "name": "JOAO DA SILVA",
            "email": "joao.silva@email.com",
            "signed_at": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            "ip": "177.42.11.98",
            "uuid": "d4s_550e8400e29b41d4a716446655440001"
        }
    ]

    for sig in signatures:
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_text_color(60, 60, 60)
        pdf.cell(0, 6, f"{sig['role']}: {sig['name']}", new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font('Helvetica', '', 8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 5, f"E-mail: {sig['email']}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 5, f"Data/Hora: {sig['signed_at']} | IP: {sig['ip']}", new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font('Helvetica', 'I', 7)
        pdf.set_text_color(150, 150, 150)
        pdf.cell(0, 4, f"Assinatura UUID: {sig['uuid']} | Status: DOCUMENTO ASSINADO E VALIDADO", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    output_path = "/home/ubuntu/glutec-clinica/exemplo_prontuario_premium_assinado_final.pdf"
    pdf.output(output_path)
    return output_path

if __name__ == "__main__":
    path = create_final_pdf()
    print(f"✓ PDF Refatorado v4 (Opacidade Corrigida) gerado em: {path}")
