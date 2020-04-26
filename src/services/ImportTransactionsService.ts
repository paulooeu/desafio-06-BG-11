import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}
class ImportTransactionsService {
  async execute(filepath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(filepath);
    const pasers = csvParse({
      from_line: 2,
    });

    const parseCSV = contactsReadStream.pipe(pasers);
    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );
      if (!title || !type || !value) return;
      categories.push(category);
      transactions.push({ title, type, value, category });
    });
    await new Promise(resolve => parseCSV.on('end', resolve));
    const existenteCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });
    const existenteCategoriesTitles = existenteCategories.map(
      (category: Category) => category.title,
    );
    const addCategoryTitles = categories
      .filter(category => !existenteCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );
    await categoriesRepository.save(newCategories);
    const finalCategories = [...newCategories, ...existenteCategories];
    const createTransactions = transactionRepository.create(
      transactions.map(transactions => ({
        title: transactions.title,
        type: transactions.type,
        value: transactions.value,
        category: finalCategories.find(
          category => category.title === transactions.category,
        ),
      })),
    );
    await transactionRepository.save(createTransactions);
    await fs.promises.unlink(filepath);
    return createTransactions;
  }
}

export default ImportTransactionsService;
