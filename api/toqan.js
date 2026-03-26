export default async function handler(req, res) {
  // Só aceita requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Pega a mensagem enviada do frontend
  const { message } = req.body;

  // Valida se a mensagem foi enviada
  if (!message) {
    return res.status(400).json({ error: 'Mensagem é obrigatória' });
  }

  try {
    // Chama a API do Toqan
    const response = await fetch('https://api.toqan.ai/api/create_conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'X-Api-Key': process.env.TOQAN_API_KEY
      },
      body: JSON.stringify({
        user_message: message
      })
    });

    // Verifica se deu erro
    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).json({ 
        error: 'Erro ao comunicar com Toqan',
        details: errorData 
      });
    }

    // Retorna a resposta do Toqan
    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ 
      error: 'Erro interno',
      details: error.message 
    });
  }
}
