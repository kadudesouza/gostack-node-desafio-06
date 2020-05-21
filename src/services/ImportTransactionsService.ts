import { getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const readCSVStream = fs.createReadStream(filePath);

    const parseStream = csvParse({
      from_line: 2,
      ltrim: true,
      rtrim: true,
    });

    const parseCSV = readCSVStream.pipe(parseStream);

    const transactions: CSVTransaction[] = [];
    const categoriesTitles: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      categoriesTitles.push(category);

      transactions.push({
        title,
        type,
        value: parseInt(value, 10),
        category,
      });
    });

    await new Promise(resolve => {
      parseCSV.on('end', resolve);
    });

    const categoriesRepository = getRepository(Category);
    const transactionsRepository = getRepository(Transaction);

    const savedCategories = await categoriesRepository.find({
      where: { title: In(categoriesTitles) },
    });

    const savedCategoriesTitle = savedCategories.map(
      (category: Category) => category.title,
    );

    const unsavedCategoryTitles = categoriesTitles
      .filter(category => !savedCategoriesTitle.includes(category))
      .filter((item, index, array) => array.indexOf(item) === index);

    const newCategories = await categoriesRepository.create(
      unsavedCategoryTitles.map(title => ({ title })),
    );

    await categoriesRepository.save(newCategories);

    const allSavedCategories = [...newCategories, ...savedCategories];

    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allSavedCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
